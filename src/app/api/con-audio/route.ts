import { promises as fs } from 'node:fs';
import path from 'node:path';

import { NextResponse } from 'next/server';

import { conCarpetaTemporal, correrFfmpeg, urlDeMotion } from '@/lib/ffmpeg';
import { removeObject, uploadPublic } from '@/lib/storage';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Solo videos terminados nuestros (carpeta videos/). */
function urlDeVideos(url: unknown): URL | null {
  if (typeof url !== 'string') return null;
  try {
    const u = new URL(url);
    return u.hostname.endsWith('.public.blob.vercel-storage.com') && u.pathname.startsWith('/videos/') ? u : null;
  } catch { return null; }
}

const tieneAudio = (log: string) => /Stream #\d+:\d+(\[[^\]]*\])?(\([^)]*\))?: Audio/.test(log);

/**
 * Le pega al video terminado el sonido del video original (el que se subió
 * CON sonido), desde el segundo 0, así queda sincronizado con los movimientos.
 * La imagen se copia tal cual (sin recomprimir). Guarda el video nuevo en
 * videos/ y borra el anterior. Si el original no tenía sonido, no cambia nada.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { video?: string; audio?: string } | null;
  const v = urlDeVideos(body?.video);
  const a = urlDeMotion(body?.audio);
  if (!v || !a) return NextResponse.json({ error: 'Faltan el video o el original.' }, { status: 400 });
  try {
    return await conCarpetaTemporal(async (dir) => {
      const extA = (a.pathname.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4';
      const entradaV = path.join(dir, 'video.mp4');
      const entradaA = path.join(dir, `original.${extA}`);
      const salida = path.join(dir, 'out.mp4');
      const [rv, ra] = await Promise.all([fetch(v.toString(), { cache: 'no-store' }), fetch(a.toString(), { cache: 'no-store' })]);
      if (!rv.ok) return NextResponse.json({ error: 'No se pudo leer el video terminado.' }, { status: 502 });
      if (!ra.ok) return NextResponse.json({ error: 'El video original ya no está (se borra a los 3 días).' }, { status: 410 });
      await fs.writeFile(entradaV, new Uint8Array(await rv.arrayBuffer()));
      await fs.writeFile(entradaA, new Uint8Array(await ra.arrayBuffer()));

      const info = await correrFfmpeg(['-hide_banner', '-i', entradaA]);
      if (!tieneAudio(info.log)) return NextResponse.json({ url: v.toString(), cambio: false });
      const infoV = await correrFfmpeg(['-hide_banner', '-i', entradaV]);
      const hevc = /Video: (hevc|h265)/i.test(infoV.log);

      const { code } = await correrFfmpeg([
        '-hide_banner', '-y', '-i', entradaV, '-i', entradaA,
        '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-af', 'apad', '-c:a', 'aac', '-b:a', '192k',
        '-shortest', ...(hevc ? ['-tag:v', 'hvc1'] : []), '-movflags', '+faststart', salida,
      ]);
      if (code !== 0) return NextResponse.json({ error: 'No se pudo pegar el sonido.' }, { status: 500 });

      const bytes = new Uint8Array(await fs.readFile(salida));
      const base = v.pathname.split('/').pop()!.replace(/\.[^.]+$/, '').replace(/-sonido$/, '');
      const up = await uploadPublic(`videos/${base}-sonido.mp4`, bytes, 'video/mp4');
      if (!up.url) return NextResponse.json({ error: up.error ?? 'No se pudo guardar el video con sonido.' }, { status: 500 });
      if (up.url !== v.toString()) await removeObject(v.toString()).catch(() => undefined);
      return NextResponse.json({ url: up.url, cambio: true });
    });
  } catch {
    return NextResponse.json({ error: 'No se pudo pegar el sonido. Probá de nuevo.' }, { status: 500 });
  }
}
