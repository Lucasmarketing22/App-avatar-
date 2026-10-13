import { promises as fs } from 'node:fs';
import path from 'node:path';

import { NextResponse } from 'next/server';

import { conCarpetaTemporal, correrFfmpeg, urlDeMotion } from '@/lib/ffmpeg';
import { uploadPublic } from '@/lib/storage';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Recorta un video subido (de "desde" a "hasta", en segundos): el Motion
 * Control cobra por segundo, así se paga solo el tramo que sirve. Mantiene el
 * sonido si lo tenía. Devuelve el video nuevo (en motion/, se borra a los 2
 * días) y su primer cuadro, para que la foto inicial arranque igual.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { url?: string; desde?: number; hasta?: number } | null;
  const u = urlDeMotion(body?.url);
  const desde = Math.max(0, Number(body?.desde) || 0);
  const hasta = Number(body?.hasta) || 0;
  if (!u) return NextResponse.json({ error: 'Video inválido.' }, { status: 400 });
  const dur = Math.round((hasta - desde) * 100) / 100;
  if (!(dur >= 3)) return NextResponse.json({ error: 'El tramo tiene que durar al menos 3 segundos.' }, { status: 400 });
  if (dur > 30.05) return NextResponse.json({ error: 'El tramo puede durar hasta 30 segundos.' }, { status: 400 });
  try {
    return await conCarpetaTemporal(async (dir) => {
      const ext = (u.pathname.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4';
      const entrada = path.join(dir, `in.${ext}`);
      const salida = path.join(dir, 'out.mp4');
      const cuadro = path.join(dir, 'cuadro.jpg');
      const r = await fetch(u.toString(), { cache: 'no-store' });
      if (!r.ok) return NextResponse.json({ error: 'No se pudo leer el video (¿se borró? duran 2 días).' }, { status: 502 });
      await fs.writeFile(entrada, new Uint8Array(await r.arrayBuffer()));

      // Se recodifica para cortar justo en el segundo elegido (como máximo 1920 px de lado).
      const { code } = await correrFfmpeg([
        '-hide_banner', '-y', '-ss', desde.toFixed(2), '-i', entrada, '-t', dur.toFixed(2),
        '-map', '0:v:0', '-map', '0:a:0?',
        '-vf', "scale='if(gte(iw,ih),min(1920,iw),-2)':'if(gte(iw,ih),-2,min(1920,ih))'",
        '-c:v', 'libx264', '-preset', 'superfast', '-crf', '21', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', salida,
      ]);
      if (code !== 0) return NextResponse.json({ error: 'No se pudo recortar este video.' }, { status: 500 });
      await correrFfmpeg(['-hide_banner', '-y', '-i', salida, '-frames:v', '1', '-q:v', '3', cuadro]);

      const bytes = new Uint8Array(await fs.readFile(salida));
      const base = (u.pathname.split('/').pop() || 'video').replace(/\.[^.]+$/, '').replace(/-rec-\w+$/, '').slice(0, 40);
      const id = Math.random().toString(36).slice(2, 8);
      const up = await uploadPublic(`motion/${base}-rec-${id}.mp4`, bytes, 'video/mp4');
      if (!up.url) return NextResponse.json({ error: up.error ?? 'No se pudo guardar el recorte.' }, { status: 500 });

      let cuadroUrl = '';
      let w = 0, h = 0;
      const info = await correrFfmpeg(['-hide_banner', '-i', salida]);
      const m = /Video: [^\n]*?(\d{2,5})x(\d{2,5})/.exec(info.log);
      if (m) { w = Number(m[1]); h = Number(m[2]); }
      try {
        const jpg = new Uint8Array(await fs.readFile(cuadro));
        cuadroUrl = (await uploadPublic(`refs/${base}-rec-${id}.jpg`, jpg, 'image/jpeg')).url ?? '';
      } catch { /* sin cuadro: el celu lo saca */ }
      return NextResponse.json({ url: up.url, dur, mb: bytes.length / (1024 * 1024), cuadro: cuadroUrl, w, h });
    });
  } catch {
    return NextResponse.json({ error: 'No se pudo recortar. Probá de nuevo.' }, { status: 500 });
  }
}
