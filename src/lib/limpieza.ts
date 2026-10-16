import 'server-only';

import { borrarSinCuenta, listarTodo, listPublic } from '@/lib/storage';

/** Los videos (terminados y de referencia de Motion) duran 2 días. */
export const DIAS_VIDEO = 2;
const VENCE_MS = DIAS_VIDEO * 24 * 60 * 60 * 1000;
/** videos/ de cada persona (u/<id>/videos/). */
const VIDEO_DE_CUENTA = /^u\/[a-z0-9._-]+\/videos\//;

async function borrarVencidos(blobs: { url: string; uploadedAt: number }[]): Promise<number> {
  const limite = Date.now() - VENCE_MS;
  const vencidos = blobs.filter((b) => b.uploadedAt < limite);
  await Promise.all(vencidos.map((b) => borrarSinCuenta(b.url)));
  return vencidos.length;
}

/** Al abrir la Galería: los videos vencidos de la cuenta del pedido y los temporales de Motion. */
export async function borrarVideosVencidos(): Promise<number> {
  const [propios, motion] = await Promise.all([listPublic('videos/'), listarTodo('motion/')]);
  return borrarVencidos([...propios, ...motion]);
}

/** Limpieza diaria (Cron): los videos vencidos de todas las cuentas. */
export async function borrarVideosVencidosDeTodos(): Promise<number> {
  const [raiz, motion, cuentas] = await Promise.all([listarTodo('videos/'), listarTodo('motion/'), listarTodo('u/')]);
  return borrarVencidos([...raiz, ...motion, ...cuentas.filter((b) => VIDEO_DE_CUENTA.test(b.pathname))]);
}
