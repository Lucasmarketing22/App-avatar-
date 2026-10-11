import { promises as fs } from 'node:fs';
import path from 'node:path';

import { NextResponse } from 'next/server';

import { conCarpetaTemporal, correrFfmpeg, urlDeMotion } from '@/lib/ffmpeg';
import { removeObject, uploadPublic } from '@/lib/storage';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Le saca el sonido a un video ya subido (para no usar música con derechos
 * de autor). Copia la imagen tal cual (sin recomprimir, sin perder calidad),
 * guarda el video mudo en motion/ y borra el original.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { url?: string } | null;
  const u = urlDeMotion(body?.url);
  if (!u) return NextResponse.json({ error: 'Video inválido.' }, { status: 400 });
  const url = u.toString();
  try {
    return await conCarpetaTemporal(async (dir) => {
      const ext = (u.pathname.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4';
      const entrada = path.join(dir, `in.${ext}`);
      const salida = path.join(dir, 'out.mp4');
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) return NextResponse.json({ error: 'No se pudo leer el video.' }, { status: 502 });
      await fs.writeFile(entrada, new Uint8Array(await r.arrayBuffer()));

      // Videos de iPhone (HEVC): la etiqueta hvc1 hace que Safari los siga reproduciendo.
      const info = await correrFfmpeg(['-hide_banner', '-i', entrada]);
      const hevc = /Video: (hevc|h265)/i.test(info.log);
      const teniaAudio = /Stream #\d+:\d+(\[[^\]]*\])?(\([^)]*\))?: Audio/.test(info.log);
      const { code } = await correrFfmpeg(['-hide_banner', '-y', '-i', entrada, '-map', '0:v:0', '-c', 'copy', '-an', ...(hevc ? ['-tag:v', 'hvc1'] : []), '-movflags', '+faststart', salida]);
      if (code !== 0) return NextResponse.json({ error: 'No se pudo quitar el sonido de este video.' }, { status: 500 });

      const bytes = new Uint8Array(await fs.readFile(salida));
      const base = u.pathname.split('/').pop()!.replace(/\.[^.]+$/, '');
      const up = await uploadPublic(`motion/${base}-mudo.mp4`, bytes, 'video/mp4');
      if (!up.url) return NextResponse.json({ error: up.error ?? 'No se pudo guardar el video sin sonido.' }, { status: 500 });
      await removeObject(url).catch(() => undefined);
      return NextResponse.json({ url: up.url, teniaAudio, mb: bytes.length / (1024 * 1024) });
    });
  } catch {
    return NextResponse.json({ error: 'No se pudo quitar el sonido. Probá de nuevo.' }, { status: 500 });
  }
}
