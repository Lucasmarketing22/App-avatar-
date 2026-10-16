/**
 * Sesiones de la app. Funciona tanto en el middleware (edge) como en las rutas
 * de API (node): todo con WebCrypto.
 *
 * - Administrador: entra con la contraseña de la app (APP_PASSWORD).
 * - Cada persona: entra con su usuario y su contraseña (las crea el
 *   administrador). La contraseña se guarda "picada" (PBKDF2), nunca tal cual.
 *
 * La cookie lleva `v1~<cuenta>~<versión>~<vence>~<firma>` (con ~ porque el
 * usuario puede tener puntos). La firma (HMAC) usa APP_PASSWORD como secreto,
 * así nadie puede fabricar una cookie de otra cuenta.
 */
export const SESSION_COOKIE = 'musa_session';
/** Encabezado interno con la cuenta de cada pedido (lo pone el middleware). */
export const HEADER_CUENTA = 'x-musa-cuenta';
export const HEADER_VERSION = 'x-musa-version';
export const CUENTA_ADMIN = 'admin';
export const DURACION_SESION_S = 60 * 60 * 24 * 30;

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, '0')).join('');

/** Token de la versión anterior (solo contraseña): se sigue aceptando como administrador. */
export async function sessionToken(password: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(`musa:${password}`)));
}

async function firmar(texto: string, secreto: string): Promise<string> {
  const clave = await crypto.subtle.importKey('raw', enc.encode(`musa-sesion:${secreto}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', clave, enc.encode(texto)));
}

/** Nombre de cuenta válido: minúsculas, números, punto, guion y guion bajo. */
export function idCuentaValido(id: unknown): id is string {
  return typeof id === 'string' && /^[a-z0-9._-]{2,40}$/.test(id) && id !== CUENTA_ADMIN;
}

export async function crearToken(cuenta: string, version: number, secreto: string): Promise<string> {
  const vence = Math.floor(Date.now() / 1000) + DURACION_SESION_S;
  const datos = `v1~${cuenta}~${version}~${vence}`;
  return `${datos}~${await firmar(datos, secreto)}`;
}

/** Lee la cookie y devuelve de quién es (o null si no es válida o venció). */
export async function leerToken(token: string | undefined, secreto: string): Promise<{ cuenta: string; version: number } | null> {
  if (!token || !secreto) return null;
  if (token === (await sessionToken(secreto))) return { cuenta: CUENTA_ADMIN, version: 0 };
  const partes = token.split('~');
  if (partes.length !== 5 || partes[0] !== 'v1') return null;
  const [, cuenta, version, vence] = partes;
  if (cuenta !== CUENTA_ADMIN && !idCuentaValido(cuenta)) return null;
  if (!/^\d+$/.test(version) || !/^\d+$/.test(vence) || Number(vence) < Date.now() / 1000) return null;
  const esperado = await firmar(partes.slice(0, 4).join('~'), secreto);
  if (esperado.length !== partes[4].length) return null;
  let dif = 0;
  for (let i = 0; i < esperado.length; i++) dif |= esperado.charCodeAt(i) ^ partes[4].charCodeAt(i);
  return dif === 0 ? { cuenta, version: Number(version) } : null;
}

/** Contraseña de una persona → "sal" + resultado de PBKDF2 (lo único que se guarda). */
export async function picarClave(clave: string, sal?: string): Promise<{ sal: string; hash: string }> {
  const s = sal ?? hex(crypto.getRandomValues(new Uint8Array(16)).buffer);
  const base = await crypto.subtle.importKey('raw', enc.encode(clave), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(s), iterations: 120000, hash: 'SHA-256' }, base, 256);
  return { sal: s, hash: hex(bits) };
}
