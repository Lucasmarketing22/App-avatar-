import 'server-only';

import { del, get, list, put } from '@vercel/blob';

import { carpetaDe, cuentaActual } from '@/lib/cuenta';

/**
 * Almacenamiento en Vercel Blob (vive dentro de Vercel, con URLs públicas).
 * - Público porque las imágenes de referencia necesitan URL pública para que
 *   Kie pueda descargarlas, y para mostrar los resultados.
 * - La configuración (personaje, vestidos, creaciones) se guarda como JSON.
 * Requiere la variable de entorno BLOB_READ_WRITE_TOKEN (la agrega Vercel al
 * conectar un Blob Store al proyecto).
 */
function configured(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

const SIN_CONFIG = 'Falta configurar el almacenamiento (Vercel Blob). Conectá un Blob Store en Vercel.';

/**
 * Cada cuenta guarda lo suyo en su carpeta (ver carpetaDe): el administrador
 * en la raíz y cada persona en u/<id>/. Estas rutas son de toda la app (no de
 * una cuenta): fichas de pedidos, cuentas, saldos, precios, videos temporales
 * de Motion y el registro de costos.
 */
const GLOBALES = ['tareas/', 'cuentas/', 'saldo/', 'motion/', 'config/costos.json', 'config/precios.json'];
const esGlobal = (ruta: string) => GLOBALES.some((g) => ruta === g || ruta.startsWith(g));

/** Ruta real en el almacenamiento para la cuenta del pedido. */
export function rutaCuenta(ruta: string): string {
  const r = ruta.replace(/^\/+/, '');
  return esGlobal(r) ? r : `${carpetaDe(cuentaActual())}${r}`;
}

/** Ruta (sin dominio) de una URL del almacenamiento. */
function rutaDeUrl(pathOrUrl: string): string {
  try { return decodeURIComponent(new URL(pathOrUrl).pathname).replace(/^\/+/, ''); } catch { return pathOrUrl.replace(/^\/+/, ''); }
}

/** ¿Este archivo es de la cuenta del pedido? (o un video temporal de Motion). */
export function esDeLaCuenta(pathOrUrl: string): boolean {
  const r = rutaDeUrl(pathOrUrl);
  if (r.startsWith('motion/')) return true;
  if (esGlobal(r)) return false;
  let carpeta: string;
  try { carpeta = carpetaDe(cuentaActual()); } catch { return false; }
  return carpeta ? r.startsWith(carpeta) : !r.startsWith('u/');
}

export async function uploadPublic(
  path: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<{ url?: string; error?: string }> {
  if (!configured()) return { error: SIN_CONFIG };
  try {
    const { url } = await put(rutaCuenta(path), Buffer.from(bytes), {
      access: 'public',
      contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return { url };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'No se pudo guardar la imagen.' };
  }
}

/** Lista los objetos cuyo nombre empieza con un prefijo (ej: "results/"), de la cuenta del pedido. */
export async function listPublic(
  prefix: string,
): Promise<{ url: string; pathname: string; uploadedAt: number }[]> {
  return listarTodo(rutaCuenta(prefix));
}

/** Lista por ruta real, sin importar la cuenta (limpieza, saldos, panel del administrador). */
export async function listarTodo(
  prefix: string,
): Promise<{ url: string; pathname: string; uploadedAt: number }[]> {
  if (!configured()) return [];
  // Vercel Blob devuelve de a 1000: seguimos pidiendo hasta tener todo (tope 20.000).
  const todos: { url: string; pathname: string; uploadedAt: number }[] = [];
  try {
    let cursor: string | undefined;
    for (let i = 0; i < 20; i++) {
      const r = await list({ prefix, cursor, limit: 1000 });
      for (const b of r.blobs) todos.push({ url: b.url, pathname: b.pathname, uploadedAt: new Date(b.uploadedAt).getTime() });
      if (!r.hasMore || !r.cursor) break;
      cursor = r.cursor;
    }
  } catch { /* devolvemos lo que se haya podido leer */ }
  return todos;
}

/**
 * Borra un objeto (por su ruta o URL). No falla si no existe. Solo borra
 * archivos de la cuenta del pedido: nadie puede borrar lo de otra persona.
 */
export async function removeObject(pathOrUrl: string): Promise<void> {
  if (!configured() || !esDeLaCuenta(pathOrUrl)) return;
  await del(pathOrUrl).catch(() => undefined);
}

/** Borra sin mirar la cuenta (solo para la limpieza automática y los saldos). */
export async function borrarSinCuenta(pathOrUrl: string): Promise<void> {
  if (!configured()) return;
  await del(pathOrUrl).catch(() => undefined);
}

/**
 * "Fichas" en JSON (config/<nombre>.json). Nos evita una base de datos:
 * guardamos personaje, vestidos y creaciones como archivitos JSON.
 */
export async function readJson<T>(name: string, fallback: T): Promise<T> {
  return readJsonEn(`config/${name}.json`, fallback);
}

/** Lee un JSON guardado en cualquier ruta (ej. tareas/<id>.json). */
export async function readJsonEn<T>(ruta: string, fallback: T): Promise<T> {
  if (!configured()) return fallback;
  try {
    // useCache:false => leemos siempre la última versión (sin caché de CDN).
    const res = await get(rutaCuenta(ruta), { access: 'public', useCache: false });
    if (!res || res.statusCode !== 200) return fallback;
    return (await new Response(res.stream).json()) as T;
  } catch {
    return fallback;
  }
}

export async function writeJson(name: string, value: unknown): Promise<{ ok: boolean; error?: string }> {
  return writeJsonEn(`config/${name}.json`, value);
}

/** Guarda un JSON en cualquier ruta (ej. tareas/<id>.json). */
export async function writeJsonEn(ruta: string, value: unknown): Promise<{ ok: boolean; error?: string }> {
  if (!configured()) return { ok: false, error: SIN_CONFIG };
  try {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    await put(rutaCuenta(ruta), Buffer.from(bytes), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo guardar.' };
  }
}

/**
 * Cuánto ocupa el almacenamiento, en bytes, total y por carpeta (results,
 * videos, motion, voces, config…). El administrador ve todo; cada persona,
 * solo lo suyo. Recorre todas las páginas.
 */
export async function usoAlmacenamiento(): Promise<{ total: number; carpetas: Record<string, number>; archivos: number } | null> {
  if (!configured()) return null;
  try {
    const prefijo = carpetaDe(cuentaActual());
    const carpetas: Record<string, number> = {};
    let total = 0;
    let archivos = 0;
    let cursor: string | undefined;
    do {
      const res = await list({ cursor, limit: 1000, ...(prefijo ? { prefix: prefijo } : {}) });
      for (const b of res.blobs) {
        const carpeta = b.pathname.slice(prefijo.length).split('/')[0] || 'otros';
        carpetas[carpeta] = (carpetas[carpeta] ?? 0) + b.size;
        total += b.size;
        archivos += 1;
      }
      cursor = res.hasMore ? res.cursor : undefined;
    } while (cursor);
    return { total, carpetas, archivos };
  } catch {
    return null;
  }
}
