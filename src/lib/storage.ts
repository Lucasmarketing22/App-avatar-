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

let bucketReady = false;
async function ensureBucket(sb: ReturnType<typeof admin>) {
  if (bucketReady) return;
  // createBucket devuelve error si ya existe: lo ignoramos.
  await sb.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: '20MB',
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
  });
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
