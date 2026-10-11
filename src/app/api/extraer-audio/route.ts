import { promises as fs } from 'node:fs';
import path from 'node:path';

import { NextResponse } from 'next/server';

import { conCarpetaTemporal, correrFfmpeg, duracionDeLog, urlDeMotion } from '@/lib/ffmpeg';
import { removeObject, uploadPublic } from '@/lib/storage';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Saca la voz (audio) de un video subido —por ejemplo uno hecho en Flow con
 * Mila hablando— o convierte un audio a MP3. Guarda motion/<nombre>-voz.mp3
 * (sirve para "Mila hablando") y borra el archivo original.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { url?: string } | null;
  const u = urlDeMotion(body?.url);
  if (!u) return NextResponse.json({ error: 'Archivo inválido.' }, { status: 400 });
  const url = u.toString();
  try {
    return await conCarpetaTemporal(async (dir) => {
      const ext = (u.pathname.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4';
      const entrada = path.join(dir, `in.${ext}`);
      const salida = path.join(dir, 'voz.mp3');
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) return NextResponse.json({ error: 'No se pudo leer el archivo.' }, { status: 502 });
      await fs.writeFile(entrada, new Uint8Array(await r.arrayBuffer()));

      const info = await correrFfmpeg(['-hide_banner', '-i', entrada]);
      if (!/Stream #\d+:\d+(\[[^\]]*\])?(\([^)]*\))?: Audio/.test(info.log)) {
        await removeObject(url).catch(() => undefined);
        return NextResponse.json({ error: 'Ese archivo no tiene sonido (no hay voz para sacar).' }, { status: 400 });
      }
      const { code } = await correrFfmpeg(['-hide_banner', '-y', '-i', entrada, '-vn', '-ac', '2', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '192k', salida]);
      if (code !== 0) return NextResponse.json({ error: 'No se pudo sacar el audio de este archivo.' }, { status: 500 });

      const bytes = new Uint8Array(await fs.readFile(salida));
      const base = u.pathname.split('/').pop()!.replace(/\.[^.]+$/, '');
      const up = await uploadPublic(`motion/${base}-voz.mp3`, bytes, 'audio/mpeg');
      if (!up.url) return NextResponse.json({ error: up.error ?? 'No se pudo guardar el audio.' }, { status: 500 });
      await removeObject(url).catch(() => undefined);
      return NextResponse.json({ url: up.url, dur: duracionDeLog(info.log), mb: bytes.length / (1024 * 1024) });
    });
  } catch {
    return NextResponse.json({ error: 'No se pudo sacar el audio. Probá de nuevo.' }, { status: 500 });
  }
}
