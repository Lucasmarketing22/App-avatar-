import 'server-only';

import { borrarSinCuenta, listarTodo } from '@/lib/storage';

/** Los videos (terminados y de referencia de Motion) duran 2 días. */
export const DIAS_VIDEO = 2;
const VENCE_MS = DIAS_VIDEO * 24 * 60 * 60 * 1000;
/** videos/ de cada persona (u/<id>/videos/). */
const VIDEO_DE_CUENTA = /^u\/[a-z0-9._-]+\/videos\//;

/** Borra los vencidos de una lista ya pedida y devuelve sus URLs. */
export async function borrarVencidos(blobs: { url: string; uploadedAt: number }[]): Promise<Set<string>> {
  const limite = Date.now() - VENCE_MS;
  const vencidos = blobs.filter((b) => b.uploadedAt < limite);
  await Promise.all(vencidos.map((b) => borrarSinCuenta(b.url)));
  return new Set(vencidos.map((b) => b.url));
}

/** Limpieza diaria (Cron): los videos vencidos de todas las cuentas y los temporales de Motion. */
export async function borrarVideosVencidosDeTodos(): Promise<number> {
  const [raiz, motion, cuentas] = await Promise.all([listarTodo('videos/'), listarTodo('motion/'), listarTodo('u/')]);
  return (await borrarVencidos([...raiz, ...motion, ...cuentas.filter((b) => VIDEO_DE_CUENTA.test(b.pathname))])).size;
}
