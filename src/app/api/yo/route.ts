import { NextResponse } from 'next/server';

import { cuentaActual, esAdmin, versionSesion } from '@/lib/cuenta';
import { leerCuenta } from '@/lib/cuentas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** ¿Quién está usando la app? (para mostrar u ocultar el panel del administrador). */
export async function GET() {
  const cuenta = cuentaActual();
  if (esAdmin(cuenta)) return NextResponse.json({ cuenta, nombre: 'Administrador', admin: true });
  const c = await leerCuenta(cuenta);
  if (!c || c.bloqueada || c.version !== versionSesion()) {
    return NextResponse.json({ error: 'Tu sesión venció o tu cuenta está pausada. Volvé a entrar.' }, { status: 401 });
  }
  return NextResponse.json({ cuenta, nombre: c.nombre, admin: false });
}
