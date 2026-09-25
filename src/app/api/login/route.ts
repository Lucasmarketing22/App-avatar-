import { NextResponse } from 'next/server';

import { SESSION_COOKIE, sessionToken } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { password?: string } | null;
  const password = body?.password ?? '';

  if (!process.env.APP_PASSWORD) {
    return NextResponse.json(
      { error: 'La app todavía no tiene contraseña configurada (falta APP_PASSWORD).' },
      { status: 500 },
    );
  }
  if (password !== process.env.APP_PASSWORD) {
    return NextResponse.json({ error: 'Contraseña incorrecta.' }, { status: 401 });
  }

  const token = await sessionToken(process.env.APP_PASSWORD);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
