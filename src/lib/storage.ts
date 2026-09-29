import 'server-only';

import { createClient } from '@supabase/supabase-js';

/**
 * Almacenamiento en Supabase Storage. Usamos la clave de servicio (solo
 * servidor) y un bucket público "musa" que la app crea sola la primera vez.
 * Público porque: (a) las imágenes de referencia deben tener URL pública para
 * que Kie pueda descargarlas, y (b) simplifica mostrar los resultados.
 */
const BUCKET = 'musa';

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp', 'application/json'];

let bucketReady = false;
async function ensureBucket(sb: ReturnType<typeof admin>) {
  if (bucketReady) return;
  // createBucket devuelve error si ya existe: lo ignoramos.
  await sb.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: '20MB',
    allowedMimeTypes: ALLOWED_MIME,
  });
  // Si el bucket ya existía (Etapa 1, solo imágenes), lo actualizamos para que
  // acepte también los JSON de configuración. No falla si ya estaba así.
  await sb.storage
    .updateBucket(BUCKET, {
      public: true,
      fileSizeLimit: '20MB',
      allowedMimeTypes: ALLOWED_MIME,
    })
    .catch(() => undefined);
  bucketReady = true;
}

export async function uploadPublic(
  path: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<{ url?: string; error?: string }> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return { error: 'Falta configurar Supabase (URL o clave de servicio).' };
  }
  const sb = admin();
  await ensureBucket(sb);
  const { error } = await sb.storage.from(BUCKET).upload(path, bytes, {
    contentType,
    upsert: true,
  });
  if (error) return { error: error.message };
  const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl };
}

/** Borra un objeto del bucket (por su ruta). No falla si no existe. */
export async function removeObject(path: string): Promise<void> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) return;
  const sb = admin();
  await sb.storage.from(BUCKET).remove([path]).catch(() => undefined);
}

/**
 * "Fichas" en JSON dentro del bucket (config/<nombre>.json). Nos evita tener
 * que configurar una base de datos: guardamos el personaje, los vestidos y las
 * creaciones como archivitos JSON. Solo el servidor los lee/escribe.
 */
export async function readJson<T>(name: string, fallback: T): Promise<T> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return fallback;
  }
  const sb = admin();
  await ensureBucket(sb);
  const { data, error } = await sb.storage.from(BUCKET).download(`config/${name}.json`);
  if (error || !data) return fallback;
  try {
    const text = await data.text();
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

export async function writeJson(name: string, value: unknown): Promise<{ ok: boolean; error?: string }> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return { ok: false, error: 'Falta configurar Supabase (URL o clave de servicio).' };
  }
  const sb = admin();
  await ensureBucket(sb);
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const { error } = await sb.storage.from(BUCKET).upload(`config/${name}.json`, bytes, {
    contentType: 'application/json',
    upsert: true,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
