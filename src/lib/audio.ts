import 'server-only';

import { promises as fs } from 'node:fs';
import path from 'node:path';

import { conCarpetaTemporal, correrFfmpeg, urlDeMotion } from '@/lib/ffmpeg';

const tieneAudio = (log: string) => /Stream #\d+:\d+(\[[^\]]*\])?(\([^)]*\))?: Audio/.test(log);

/**
 * Le pega a un video terminado el sonido del video original (el que se subió
 * CON sonido), desde el segundo 0, así queda sincronizado con los movimientos.
 * La imagen se copia tal cual (sin recomprimir) y el audio se completa con
 * silencio si es más corto: el video nunca se corta.
 * Devuelve los bytes nuevos, o null si el original no tenía sonido.
 */
export async function pegarAudio(video: Uint8Array, original: string): Promise<{ bytes: Uint8Array | null; error?: string }> {
  const a = urlDeMotion(original);
  if (!a) return { bytes: null, error: 'El video original no es válido.' };
  try {
    return await conCarpetaTemporal(async (dir) => {
      const extA = (a.pathname.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4';
      const entradaV = path.join(dir, 'video.mp4');
      const entradaA = path.join(dir, `original.${extA}`);
      const salida = path.join(dir, 'out.mp4');
      const ra = await fetch(a.toString(), { cache: 'no-store' });
      if (!ra.ok) return { bytes: null, error: 'El video original ya no está (se borra a los 2 días).' };
      await fs.writeFile(entradaV, video);
      await fs.writeFile(entradaA, new Uint8Array(await ra.arrayBuffer()));

      const info = await correrFfmpeg(['-hide_banner', '-i', entradaA]);
      if (!tieneAudio(info.log)) return { bytes: null };
      const infoV = await correrFfmpeg(['-hide_banner', '-i', entradaV]);
      const hevc = /Video: (hevc|h265)/i.test(infoV.log);

      const { code } = await correrFfmpeg([
        '-hide_banner', '-y', '-i', entradaV, '-i', entradaA,
        '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-af', 'apad', '-c:a', 'aac', '-b:a', '192k',
        '-shortest', ...(hevc ? ['-tag:v', 'hvc1'] : []), '-movflags', '+faststart', salida,
      ]);
      if (code !== 0) return { bytes: null, error: 'No se pudo pegar el sonido.' };
      return { bytes: new Uint8Array(await fs.readFile(salida)) };
    });
  } catch {
    return { bytes: null, error: 'No se pudo pegar el sonido.' };
  }
}
