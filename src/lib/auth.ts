/**
 * Contraseña única de la app (APP_PASSWORD). Genera un token derivado de la
 * contraseña para guardarlo en una cookie, sin exponer la contraseña real.
 * Funciona tanto en el middleware (edge) como en las rutas de API (node).
 */
export async function sessionToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(`musa:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export const SESSION_COOKIE = 'musa_session';
