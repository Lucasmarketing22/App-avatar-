import { promises as fs } from 'node:fs';
import path from 'node:path';

import { NextResponse } from 'next/server';

import { conCarpetaTemporal, correrFfmpeg, duracionDeLog, urlDeMotion } from '@/lib/ffmpeg';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Revisión gratis de un video subido (no usa créditos de la IA): duración y
 * cortes de cámara. Los cortes (videos editados de TikTok/Reels) confunden
 * mucho al Motion Control y son de las causas más comunes de videos fallidos.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { url?: string } | null;
  const u = urlDeMotion(body?.url);
  if (!u) return NextResponse.json({ error: 'Video inválido.' }, { status: 400 });
  try {
    return await conCarpetaTemporal(async (dir) => {
      const ext = (u.pathname.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4';
      const entrada = path.join(dir, `in.${ext}`);
      const r = await fetch(u.toString(), { cache: 'no-store' });
      if (!r.ok) return NextResponse.json({ error: 'No se pudo leer el video.' }, { status: 502 });
      await fs.writeFile(entrada, new Uint8Array(await r.arrayBuffer()));
      // Achicamos mucho la imagen (más rápido) y marcamos los cambios bruscos de escena.
      const { log } = await correrFfmpeg(['-hide_banner', '-i', entrada, '-map', '0:v:0', '-vf', "scale=160:-2,select='gt(scene,0.35)',showinfo", '-f', 'null', '-']);
      const dur = duracionDeLog(log);
      const cortes = [...log.matchAll(/pts_time:(\d+(?:\.\d+)?)/g)]
        .map((m) => Math.round(Number(m[1]) * 10) / 10)
        .filter((t) => t > 0.3 && (!dur || t < dur - 0.3))
        .filter((t, i, a) => i === 0 || t - a[i - 1] > 0.5)
        .slice(0, 30);
      return NextResponse.json({ dur, cortes });
    });
  } catch {
    return NextResponse.json({ error: 'No se pudo revisar el video.' }, { status: 500 });
  }
}
