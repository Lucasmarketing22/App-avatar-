import { NextResponse } from 'next/server';

import { leerCostos } from '@/lib/costos';
import { cuentaActual, esAdmin } from '@/lib/cuenta';
import { getCredits } from '@/lib/ia/kie';
import { leerPrecios, saldoDe } from '@/lib/saldo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Saldo + último costo conocido de cada tipo de generación.
 *  - Administrador: el saldo real de Kie y lo que cobra Kie.
 *  - Cada persona: su saldo en la app y los costos con su precio (Kie × multiplicador).
 */
export async function GET() {
  const cuenta = cuentaActual();
  if (esAdmin(cuenta)) {
    const [credits, costos] = await Promise.all([getCredits(), leerCostos()]);
    return NextResponse.json({ credits, costos, mult: 1, admin: true });
  }
  const [{ saldo, reservado }, costosKie, { multiplicador }] = await Promise.all([saldoDe(cuenta), leerCostos(), leerPrecios()]);
  const costos = Object.fromEntries(Object.entries(costosKie).map(([k, v]) => [k, { ...v, credits: v.credits * multiplicador }]));
  return NextResponse.json({ credits: Math.max(0, saldo), reservado, costos, mult: multiplicador, admin: false });
}
