import 'server-only';

import crypto from 'node:crypto';

import { createClient } from '@/lib/supabase/server';

/**
 * Capa de servicio para avatares. La imagen de referencia se guarda en un
 * bucket PRIVADO de Supabase Storage ("avatar-references") bajo la ruta
 * <user_id>/<uuid>.<ext>. En la columna avatars.reference_image_url guardamos
 * esa RUTA (no una URL publica); para mostrarla generamos URLs firmadas.
 */

const BUCKET = 'avatar-references';
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED = new Map<string, string>([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
]);
const SIGNED_URL_TTL = 60 * 60; // 1 hora

export type AvatarView = {
  id: string;
  name: string;
  created_at: string;
  provider_reference_id: string | null;
  /** URL firmada temporal para mostrar la imagen (o null si no hay/falla). */
  imageUrl: string | null;
};

/** Crea un avatar subiendo su imagen de referencia al bucket privado. */
export async function createAvatar(
  name: string,
  file: File,
): Promise<{ error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'No autenticado.' };

  const cleanName = name.trim();
  if (!cleanName) return { error: 'Ponle un nombre al avatar.' };
  if (!file || file.size === 0) return { error: 'Adjunta una imagen de referencia.' };
  if (file.size > MAX_BYTES) return { error: 'La imagen supera el límite de 10 MB.' };

  const ext = ALLOWED.get(file.type);
  if (!ext) return { error: 'Formato no soportado (usa PNG, JPG o WEBP).' };

  const path = `${user.id}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) return { error: `Error al subir la imagen: ${uploadError.message}` };

  const { error: insertError } = await supabase.from('avatars').insert({
    user_id: user.id,
    name: cleanName,
    reference_image_url: path,
  });

  if (insertError) {
    // Rollback del archivo si no se pudo crear la fila.
    await supabase.storage.from(BUCKET).remove([path]);
    return { error: insertError.message };
  }

  return {};
}

/** Lista los avatares del usuario con una URL firmada para mostrar la imagen. */
export async function listAvatars(): Promise<AvatarView[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('avatars')
    .select('id, name, reference_image_url, provider_reference_id, created_at')
    .order('created_at', { ascending: false });

  if (error || !data) return [];

  return Promise.all(
    data.map(async (row) => {
      let imageUrl: string | null = null;
      if (row.reference_image_url) {
        const { data: signed } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(row.reference_image_url, SIGNED_URL_TTL);
        imageUrl = signed?.signedUrl ?? null;
      }
      return {
        id: row.id,
        name: row.name,
        created_at: row.created_at,
        provider_reference_id: row.provider_reference_id,
        imageUrl,
      };
    }),
  );
}

/** Elimina un avatar: borra el archivo del Storage y luego la fila. */
export async function deleteAvatar(id: string): Promise<{ error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'No autenticado.' };

  const { data: row } = await supabase
    .from('avatars')
    .select('reference_image_url')
    .eq('id', id)
    .single();

  if (row?.reference_image_url) {
    await supabase.storage.from(BUCKET).remove([row.reference_image_url]);
  }

  const { error } = await supabase.from('avatars').delete().eq('id', id);
  if (error) return { error: error.message };
  return {};
}
