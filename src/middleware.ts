import { NextResponse, type NextRequest } from 'next/server';

import { SESSION_COOKIE, sessionToken } from '@/lib/auth';

/**
 * Candado de la app: todo requiere haber entrado con la contraseña única,
 * excepto la propia pantalla de login y su API.
 */
const PUBLIC_PATHS = new Set(['/login', '/api/login', '/api/health']);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  const password = process.env.APP_PASSWORD;
  // Si todavía no se configuró la contraseña, no bloqueamos (primer arranque).
  if (!password) return NextResponse.next();

  const expected = await sessionToken(password);
  const cookie = request.cookies.get(SESSION_COOKIE)?.value;
  if (cookie === expected) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = '/login';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff2?)$).*)',
  ],
};
