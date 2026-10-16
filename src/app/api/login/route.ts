import { NextResponse } from 'next/server';

import { CUENTA_ADMIN, DURACION_SESION_S, SESSION_COOKIE, crearToken } from '@/lib/auth';
import { normalizarUsuario, verificarClave } from '@/lib/cuentas';

export const runtime = 'nodejs';

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Entrar a la app.
 *  - Sin usuario (o "admin"): contraseña de la app → administrador.
 *  - Con usuario: la cuenta que creó el administrador, con su contraseña.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { usuario?: string; password?: string } | null;
  const password = typeof body?.password === 'string' ? body.password : '';
  const usuario = normalizarUsuario(typeof body?.usuario === 'string' ? body.usuario : '');
  const secreto = process.env.APP_PASSWORD;

  if (!secreto) {
    return NextResponse.json(
      { error: 'La app todavía no tiene contraseña configurada (falta APP_PASSWORD).' },
      { status: 500 },
    );
  }

  let token = '';
  if (!usuario || usuario === CUENTA_ADMIN) {
    if (password === secreto) token = await crearToken(CUENTA_ADMIN, 0, secreto);
  } else {
    const cuenta = await verificarClave(usuario, password);
    if (cuenta) token = await crearToken(cuenta.id, cuenta.version, secreto);
  }
  if (!token) {
    await esperar(600); // frena a quien prueba contraseñas al azar
    return NextResponse.json({ error: usuario ? 'Usuario o contraseña incorrectos (o la cuenta está pausada).' : 'Contraseña incorrecta.' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: DURACION_SESION_S,
  });
  return res;
}
