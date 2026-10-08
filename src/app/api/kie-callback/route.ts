import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * Algunos modelos de Kie (Kling 3.0) piden una dirección de aviso
 * (callBackUrl). Nosotros ya consultamos el estado con /api/status, así que
 * acá solo respondemos OK y no hacemos nada con lo que llega.
 */
export async function POST() {
  return NextResponse.json({ ok: true });
}
