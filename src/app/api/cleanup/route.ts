import { NextResponse } from 'next/server';

import { borrarVideosVencidos } from '@/lib/limpieza';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Limpieza diaria (Vercel Cron, ver vercel.json): borra los videos con más de
 * 3 días. Es pública en el middleware para que el Cron pueda llamarla; si hay
 * CRON_SECRET en Vercel se exige, y si no, solo acepta llamadas del Cron.
 * Solo borra lo que ya venció, así que repetirla no hace daño.
 */
export async function GET(request: Request) {
  const secreto = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization') ?? '';
  const agente = request.headers.get('user-agent') ?? '';
  const permitido = secreto ? auth === `Bearer ${secreto}` : agente.includes('vercel-cron');
  if (!permitido) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });

  const borrados = await borrarVideosVencidos();
  return NextResponse.json({ ok: true, borrados });
}
