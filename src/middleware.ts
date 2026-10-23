import { NextResponse, type NextRequest } from 'next/server';

import { CUENTA_ADMIN, HEADER_CUENTA, HEADER_VERSION, SESSION_COOKIE, leerToken } from '@/lib/auth';

/**
 * Candado de la app: todo requiere haber entrado (administrador o una cuenta),
 * excepto la pantalla de login y unas pocas rutas públicas.
 * A cada pedido le anota de qué cuenta es (encabezado interno), así cada
 * persona solo ve y guarda lo suyo. Ese encabezado nunca se acepta desde afuera.
 */
const PUBLIC_PATHS = new Set(['/login', '/api/login', '/api/health', '/api/kie-callback', '/api/replicate-callback', '/api/cleanup']);

function seguir(request: NextRequest, cuenta?: string, version = 0) {
  const headers = new Headers(request.headers);
  headers.delete(HEADER_CUENTA);
  headers.delete(HEADER_VERSION);
  if (cuenta) { headers.set(HEADER_CUENTA, cuenta); headers.set(HEADER_VERSION, String(version)); }
  return NextResponse.next({ request: { headers } });
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Conector de Claude: /api/mcp revisa su propio token; el inicio de sesión (OAuth) es público.
  if (PUBLIC_PATHS.has(pathname) || pathname === '/api/mcp' || pathname.startsWith('/api/oauth/') || pathname.startsWith('/.well-known/')) return seguir(request);

  const password = process.env.APP_PASSWORD;
  // Si todavía no se configuró la contraseña, no bloqueamos (primer arranque).
  if (!password) return seguir(request, CUENTA_ADMIN);

  const sesion = await leerToken(request.cookies.get(SESSION_COOKIE)?.value, password);
  if (sesion) return seguir(request, sesion.cuenta, sesion.version);

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
