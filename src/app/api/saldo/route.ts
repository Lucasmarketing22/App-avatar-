import { NextResponse } from 'next/server';

import { leerCostos } from '@/lib/costos';
import { getCredits } from '@/lib/ia/kie';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Saldo de Kie + último costo conocido de cada tipo de generación. */
export async function GET() {
  const [credits, costos] = await Promise.all([getCredits(), leerCostos()]);
  return NextResponse.json({ credits, costos });
}
