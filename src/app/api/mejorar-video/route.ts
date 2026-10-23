import { promises as fs } from 'node:fs';
import path from 'node:path';

import { NextResponse } from 'next/server';

import { conCarpetaTemporal, correrFfmpeg, duracionDeLog, urlDeMotion, urlDeVideoPropio } from '@/lib/ffmpeg';
import { infoTarea } from '@/lib/ia/kie';
import { HD_TOPAZ_ACTIVO } from '@/lib/mejorar';
import { estimarKie } from '@/lib/saldo';
import { uploadPublic } from '@/lib/storage';
import { pedirTarea, taskIdDeUrl } from '@/lib/tareas';

export const runtime = 'nodejs';
// Preparar la copia limpia (bajar, convertir y subir) puede tardar unos segundos.
export const maxDuration = 60;

const SIETE_DIAS = 7 * 24 * 60 * 60 * 1000;
const esUrl = (u: unknown): u is string => typeof u === 'string' && u.startsWith('https://');
/** Segundos válidos (los mide el celular al cargar el video). */
const segundos = (x: unknown) => { const n = Number(x); return Number.isFinite(n) && n > 0 && n <= 120 ? Math.ceil(n) : 0; };

/** Si el celular no pudo medir la duración, la mide el servidor (solo videos nuestros). */
async function medirEnServidor(url: string): Promise<number> {
  const u = urlDeMotion(url) ?? urlDeVideoPropio(url);
  if (!u) return 0;
  try {
    return await conCarpetaTemporal(async (dir) => {
      const r = await fetch(u.toString(), { cache: 'no-store' });
      if (!r.ok) return 0;
      const archivo = path.join(dir, 'video');
      await fs.writeFile(archivo, new Uint8Array(await r.arrayBuffer()));
      return segundos(duracionDeLog((await correrFfmpeg(['-hide_banner', '-i', archivo])).log));
    });
  } catch { return 0; }
}

/**
 * Copia "limpia" para Topaz: solo imagen (sin audio), H.264 estándar, yuv420p,
 * medidas pares y faststart. Con el video de Seedance tal cual (audio a 32 kHz)
 * Topaz en Kie respondía "internal error"; así descartamos el archivo. El sonido
 * se le vuelve a pegar al resultado desde el original (ficha.audio).
 * Devuelve la URL de la copia (carpeta motion/, se borra a los 2 días) o null.
 */
async function copiaLimpia(url: string): Promise<string | null> {
  const u = urlDeMotion(url) ?? urlDeVideoPropio(url);
  if (!u) return null;
  try {
    return await conCarpetaTemporal(async (dir) => {
      const r = await fetch(u.toString(), { cache: 'no-store' });
      if (!r.ok) return null;
      const entrada = path.join(dir, 'entrada');
      const salida = path.join(dir, 'limpio.mp4');
      await fs.writeFile(entrada, new Uint8Array(await r.arrayBuffer()));
      const { code } = await correrFfmpeg([
        '-hide_banner', '-y', '-i', entrada, '-map', '0:v:0', '-an',
        '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p',
        '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'veryfast', '-crf', '16', '-movflags', '+faststart', salida,
      ]);
      if (code !== 0) return null;
      const subida = await uploadPublic(`motion/limpio-${crypto.randomUUID()}.mp4`, new Uint8Array(await fs.readFile(salida)), 'video/mp4');
      return subida.url ?? null;
    });
  } catch { return null; }
}

/**
 * Mejorar la calidad de un video ya hecho:
 *  - 'hd': Topaz x2 (un 480p pasa a 960×1708). Sirve para cualquier video,
 *    también uno subido desde el celular (hasta 50 MB).
 *  - '1080': solo para borradores de Seedance (Escenas) de hasta 7 días: la
 *    misma escena generada de nuevo en 1080p.
 * GET ?url=…&dur=… → qué opciones hay y cuánto cuesta cada una (no gasta nada).
 * POST { url, dur, modo } → crea la tarea (se consulta con /api/status).
 */
async function opciones(url: string, dur: number) {
  const hd = await estimarKie('topaz/video-upscale', { upscale_factor: '2' }, dur);
  const id = taskIdDeUrl(url);
  const info = id ? await infoTarea(id) : null;
  const borrador = !!info && info.model === 'bytedance/seedance-2-5' && info.input.draft === true;
  const vigente = borrador && Date.now() - info!.creado < SIETE_DIAS;
  const durBorrador = segundos(info?.input.duration) || dur;
  const final = vigente ? await estimarKie('bytedance/seedance-2-5-draft', { resolution: '1080p' }, durBorrador) : null;
  return { hd, final, borrador, vigente, id, durBorrador };
}

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const url = q.get('url');
  const dur = esUrl(url) ? segundos(q.get('dur')) || await medirEnServidor(url) : 0;
  if (!esUrl(url) || !dur) return NextResponse.json({ error: 'Falta el video o su duración.' }, { status: 400 });
  const o = await opciones(url, dur);
  return NextResponse.json({ hd: o.hd, final: o.final, borrador: o.borrador, vigente: o.vigente });
}

export async function POST(request: Request) {
  const b = (await request.json().catch(() => null)) as { url?: string; dur?: number; modo?: string } | null;
  const url = b?.url;
  const dur = esUrl(url) ? segundos(b?.dur) || await medirEnServidor(url) : 0;
  if (!esUrl(url) || !dur) return NextResponse.json({ error: 'Falta el video o su duración.' }, { status: 400 });

  if (b?.modo === '1080') {
    const o = await opciones(url, dur);
    if (!o.borrador) return NextResponse.json({ error: 'Solo los borradores de Escenas se pueden pasar a 1080p. Este video no se puede mejorar.' }, { status: 400 });
    if (!o.vigente) return NextResponse.json({ error: 'Pasaron más de 7 días desde el borrador: Seedance ya no lo acepta.' }, { status: 400 });
    const r = await pedirTarea(request, 'bytedance/seedance-2-5-draft', { draft_task_id: o.id, resolution: '1080p' }, { tipo: 'video', prompt: 'Borrador pasado a 1080p (Seedance)', dur: o.durBorrador });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ taskId: r.taskId });
  }

  if (!HD_TOPAZ_ACTIVO) return NextResponse.json({ error: 'Mejorar a HD está apagado por ahora: el servicio (Topaz en Kie) está fallando.' }, { status: 503 });
  const limpio = await copiaLimpia(url);
  if (!limpio) return NextResponse.json({ error: 'No se pudo preparar el video para mejorarlo. Probá de nuevo.' }, { status: 500 });
  const r = await pedirTarea(request, 'topaz/video-upscale', { video_url: limpio, upscale_factor: '2' }, { tipo: 'video', prompt: 'Video mejorado a HD (Topaz x2)', dur, audio: url });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ taskId: r.taskId });
}
