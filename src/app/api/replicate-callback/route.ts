import { NextResponse } from 'next/server';

import { leerTarea, PREFIJO_REPLICATE, terminarTarea } from '@/lib/tareas';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Replicate avisa acá cuando una predicción termina (como /api/kie-callback).
 * No confiamos en lo que llega: con el id le volvemos a preguntar a Replicate.
 * Solo se guardan las que tienen ficha (las que pidió la app).
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { id?: string } | null;
  const id = body?.id;
  if (typeof id === 'string' && /^[a-z0-9]{1,60}$/.test(id) && (await leerTarea(`${PREFIJO_REPLICATE}${id}`))) {
    await terminarTarea(`${PREFIJO_REPLICATE}${id}`).catch(() => undefined);
  }
  return NextResponse.json({ ok: true });
}
