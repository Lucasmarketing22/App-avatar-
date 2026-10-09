import 'server-only';

import { listPublic, removeObject } from '@/lib/storage';

/** Los videos (terminados y de referencia de Motion) duran 3 días. */
export const DIAS_VIDEO = 3;
const VENCE_MS = DIAS_VIDEO * 24 * 60 * 60 * 1000;
const CARPETAS_VIDEO = ['videos/', 'motion/'];

/** Borra los videos con más de 3 días. Devuelve cuántos borró. */
export async function borrarVideosVencidos(): Promise<number> {
  const limite = Date.now() - VENCE_MS;
  let borrados = 0;
  for (const carpeta of CARPETAS_VIDEO) {
    const blobs = await listPublic(carpeta);
    const vencidos = blobs.filter((b) => b.uploadedAt < limite);
    await Promise.all(vencidos.map((b) => removeObject(b.url)));
    borrados += vencidos.length;
  }
  return borrados;
}
