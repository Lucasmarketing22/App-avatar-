import 'server-only';

import { del, get, list, put } from '@vercel/blob';

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

export async function uploadPublic(
  path: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<{ url?: string; error?: string }> {
  if (!configured()) return { error: SIN_CONFIG };
  try {
    const { url } = await put(path, Buffer.from(bytes), {
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

/** Lista los objetos cuyo nombre empieza con un prefijo (ej: "results/"). */
export async function listPublic(
  prefix: string,
): Promise<{ url: string; pathname: string; uploadedAt: number }[]> {
  if (!configured()) return [];
  try {
    const { blobs } = await list({ prefix });
    return blobs.map((b) => ({
      url: b.url,
      pathname: b.pathname,
      uploadedAt: new Date(b.uploadedAt).getTime(),
    }));
  } catch {
    return [];
  }
}

/** Borra un objeto del almacenamiento (por su ruta o URL). No falla si no existe. */
export async function removeObject(pathOrUrl: string): Promise<void> {
  if (!configured()) return;
  await del(pathOrUrl).catch(() => undefined);
}

/**
 * "Fichas" en JSON (config/<nombre>.json). Nos evita una base de datos:
 * guardamos personaje, vestidos y creaciones como archivitos JSON.
 */
export async function readJson<T>(name: string, fallback: T): Promise<T> {
  if (!configured()) return fallback;
  try {
    // useCache:false => leemos siempre la última versión (sin caché de CDN).
    const res = await get(`config/${name}.json`, { access: 'public', useCache: false });
    if (!res || res.statusCode !== 200) return fallback;
    return (await new Response(res.stream).json()) as T;
  } catch {
    return fallback;
  }
}

export async function writeJson(name: string, value: unknown): Promise<{ ok: boolean; error?: string }> {
  if (!configured()) return { ok: false, error: SIN_CONFIG };
  try {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    await put(`config/${name}.json`, Buffer.from(bytes), {
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
