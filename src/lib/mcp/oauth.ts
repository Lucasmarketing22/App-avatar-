import 'server-only';

import { CUENTA_ADMIN } from '@/lib/auth';
import { leerCuenta } from '@/lib/cuentas';

/**
 * Inicio de sesión para el conector de Claude (OAuth 2.1 con PKCE y registro
 * dinámico de clientes, lo que pide claude.ai para los conectores
 * personalizados). Todo va firmado con APP_PASSWORD (HMAC), sin guardar nada:
 *  - client_id: los redirect_uri que registró Claude;
 *  - code (5 min): cuenta + code_challenge + redirect_uri + client_id;
 *  - access_token (7 días) y refresh_token (90 días): cuenta + versión.
 * Si se bloquea la cuenta o se le cambia la contraseña, sube su versión y los
 * tokens viejos dejan de servir.
 */
type Firmado =
  | { t: 'cli'; ru: string[]; n: string }
  | { t: 'code'; c: string; v: number; cc: string; ru: string; ci: string; exp: number }
  | { t: 'acc'; c: string; v: number; exp: number }
  | { t: 'ref'; c: string; v: number; exp: number };

const enc = new TextEncoder();
const b64 = (s: string | Uint8Array) => Buffer.from(s).toString('base64url');

async function hmac(texto: string): Promise<string> {
  const clave = await crypto.subtle.importKey('raw', enc.encode(`musa-mcp:${process.env.APP_PASSWORD ?? ''}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64(new Uint8Array(await crypto.subtle.sign('HMAC', clave, enc.encode(texto))));
}

export async function firmar(datos: Firmado): Promise<string> {
  const cuerpo = b64(JSON.stringify(datos));
  return `${cuerpo}.${await hmac(cuerpo)}`;
}

export async function leerFirmado<T extends Firmado['t']>(token: unknown, tipo: T): Promise<Extract<Firmado, { t: T }> | null> {
  if (typeof token !== 'string' || !process.env.APP_PASSWORD) return null;
  const [cuerpo, firma] = token.split('.');
  if (!cuerpo || !firma || firma !== (await hmac(cuerpo))) return null;
  try {
    const d = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8')) as Firmado;
    if (d.t !== tipo) return null;
    if ('exp' in d && d.exp < Date.now() / 1000) return null;
    return d as Extract<Firmado, { t: T }>;
  } catch {
    return null;
  }
}

/** Solo se puede conectar Claude (claude.ai / claude.com) o un programa en la misma compu (Claude Code). */
export function redirectPermitido(uri: unknown): uri is string {
  if (typeof uri !== 'string') return false;
  try {
    const u = new URL(uri);
    if (u.protocol === 'http:') return u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    return u.protocol === 'https:' && /(^|\.)(claude\.ai|claude\.com|anthropic\.com)$/.test(u.hostname);
  } catch {
    return false;
  }
}

/** S256 de PKCE: base64url(sha256(verifier)). */
export async function s256(verifier: string): Promise<string> {
  return b64(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(verifier))));
}

/** ¿La cuenta sigue habilitada con esa versión? (el administrador siempre). */
export async function cuentaVigente(cuenta: string, version: number): Promise<boolean> {
  if (cuenta === CUENTA_ADMIN) return true;
  const c = await leerCuenta(cuenta);
  return !!c && !c.bloqueada && c.version === version;
}

export const DURACION_ACCESO_S = 7 * 24 * 3600;
export const DURACION_REFRESCO_S = 90 * 24 * 3600;

export async function emitirTokens(cuenta: string, version: number) {
  const ahora = Math.floor(Date.now() / 1000);
  return {
    access_token: await firmar({ t: 'acc', c: cuenta, v: version, exp: ahora + DURACION_ACCESO_S }),
    token_type: 'Bearer',
    expires_in: DURACION_ACCESO_S,
    refresh_token: await firmar({ t: 'ref', c: cuenta, v: version, exp: ahora + DURACION_REFRESCO_S }),
    scope: 'musa',
  };
}

/** Origen público de la app (detrás del proxy de Vercel). */
export function origenDe(request: Request): string {
  const h = request.headers;
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'https';
  return host ? `${proto}://${host}` : new URL(request.url).origin;
}
