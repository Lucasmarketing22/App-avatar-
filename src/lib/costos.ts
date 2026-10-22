import 'server-only';

import { readJson, writeJson } from '@/lib/storage';

/** Último costo real (en créditos de Kie) de cada tipo de generación. */
export type Costos = Record<string, { credits: number; ts: number }>;

export async function leerCostos(): Promise<Costos> {
  return readJson<Costos>('costos', {});
}

export async function registrarCosto(clave: string | undefined, credits: number | undefined): Promise<void> {
  if (!clave || typeof credits !== 'number' || !Number.isFinite(credits) || credits <= 0) return;
  const costos = await leerCostos();
  // Si costó lo mismo que la última vez no reescribimos el archivo: cada
  // escritura cuenta como operación de Vercel Blob (2.000 por mes en el plan gratis).
  if (costos[clave]?.credits === credits) return;
  costos[clave] = { credits, ts: Date.now() };
  await writeJson('costos', costos);
}
