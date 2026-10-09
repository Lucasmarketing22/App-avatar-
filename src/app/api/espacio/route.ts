import { NextResponse } from 'next/server';

import { usoAlmacenamiento } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Espacio usado en Vercel Blob (para el medidor de la Galería). */
export async function GET() {
  const uso = await usoAlmacenamiento();
  if (!uso) return NextResponse.json({ error: 'No se pudo leer el almacenamiento.' }, { status: 503 });
  return NextResponse.json(uso);
}
