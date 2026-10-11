import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { NextResponse } from 'next/server';
import ffmpegPath from 'ffmpeg-static';

import { removeObject, uploadPublic } from '@/lib/storage';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Corre ffmpeg y devuelve lo que escribió (para saber si el video tenía audio). */
function correr(args: string[]): Promise<{ code: number; log: string }> {
  return new Promise((resolve) => {
    const p = spawn(ffmpegPath as unknown as string, args);
    let log = '';
    p.stderr.on('data', (d) => { log += String(d); if (log.length > 20000) log = log.slice(-20000); });
    p.on('close', (code) => resolve({ code: code ?? 1, log }));
    p.on('error', (e) => resolve({ code: 1, log: String(e) }));
  });
}

/**
 * Le saca el sonido a un video ya subido (para no usar música con derechos
 * de autor). Copia la imagen tal cual (sin recomprimir, sin perder calidad),
 * guarda el video mudo en motion/ y borra el original.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { url?: string } | null;
  const url = typeof body?.url === 'string' ? body.url : '';
  let u: URL;
  try { u = new URL(url); } catch { return NextResponse.json({ error: 'Video inválido.' }, { status: 400 }); }
  if (!u.hostname.endsWith('.public.blob.vercel-storage.com') || !u.pathname.startsWith('/motion/')) {
    return NextResponse.json({ error: 'Video inválido.' }, { status: 400 });
  }
  if (!ffmpegPath) return NextResponse.json({ error: 'No está disponible la herramienta para quitar el sonido.' }, { status: 500 });

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mudo-'));
  const ext = (u.pathname.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4';
  const entrada = path.join(dir, `in.${ext}`);
  const salida = path.join(dir, 'out.mp4');
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return NextResponse.json({ error: 'No se pudo leer el video.' }, { status: 502 });
    await fs.writeFile(entrada, new Uint8Array(await r.arrayBuffer()));

    // Videos de iPhone (HEVC): la etiqueta hvc1 hace que Safari los siga reproduciendo.
    const info = await correr(['-hide_banner', '-i', entrada]);
    const hevc = /Video: (hevc|h265)/i.test(info.log);
    const { code, log } = await correr(['-hide_banner', '-y', '-i', entrada, '-map', '0:v:0', '-c', 'copy', '-an', ...(hevc ? ['-tag:v', 'hvc1'] : []), '-movflags', '+faststart', salida]);
    if (code !== 0) return NextResponse.json({ error: 'No se pudo quitar el sonido de este video.' }, { status: 500 });
    const teniaAudio = /Stream #\d+:\d+(\[[^\]]*\])?(\([^)]*\))?: Audio/.test(log);

    const bytes = new Uint8Array(await fs.readFile(salida));
    const base = u.pathname.split('/').pop()!.replace(/\.[^.]+$/, '');
    const up = await uploadPublic(`motion/${base}-mudo.mp4`, bytes, 'video/mp4');
    if (!up.url) return NextResponse.json({ error: up.error ?? 'No se pudo guardar el video sin sonido.' }, { status: 500 });
    await removeObject(url).catch(() => undefined);
    return NextResponse.json({ url: up.url, teniaAudio, mb: bytes.length / (1024 * 1024) });
  } catch {
    return NextResponse.json({ error: 'No se pudo quitar el sonido. Probá de nuevo.' }, { status: 500 });
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
