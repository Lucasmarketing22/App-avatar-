import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { decrypt, encrypt, maskApiKey } from '@/lib/encryption';
import type { ApiKeyProvider } from '@/lib/database.types';

/**
 * Capa de servicio para las API keys BYOK. La API key en claro NUNCA sale del
 * servidor: se cifra antes de guardarla y solo se descifra en el servidor
 * cuando hay que llamar al proveedor externo o mostrar una vista enmascarada.
 */

export type StoredApiKey = {
  provider: ApiKeyProvider;
  is_valid: boolean;
  /** Vista enmascarada segura para UI, p.ej. "r8_a****wxyz". */
  masked: string;
  created_at: string;
};

/** Guarda (o reemplaza) la API key de un proveedor para el usuario actual. */
export async function upsertApiKey(
  provider: ApiKeyProvider,
  plaintextKey: string,
  isValid: boolean,
): Promise<{ error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'No autenticado.' };

  const api_key_encrypted = encrypt(plaintextKey.trim());

  const { error } = await supabase.from('user_api_keys').upsert(
    {
      user_id: user.id,
      provider,
      api_key_encrypted,
      is_valid: isValid,
    },
    { onConflict: 'user_id,provider' },
  );

  if (error) return { error: error.message };
  return {};
}

/** Elimina la API key de un proveedor para el usuario actual. */
export async function deleteApiKey(
  provider: ApiKeyProvider,
): Promise<{ error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'No autenticado.' };

  const { error } = await supabase
    .from('user_api_keys')
    .delete()
    .eq('provider', provider);

  if (error) return { error: error.message };
  return {};
}

/**
 * Lista las API keys del usuario actual con una vista enmascarada.
 * El descifrado ocurre solo en el servidor para calcular la mascara; la clave
 * completa nunca se devuelve al cliente.
 */
export async function listApiKeys(): Promise<StoredApiKey[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('user_api_keys')
    .select('provider, api_key_encrypted, is_valid, created_at');

  if (error || !data) return [];

  return data.map((row) => {
    let masked = '****';
    try {
      masked = maskApiKey(decrypt(row.api_key_encrypted));
    } catch {
      // Si la clave de cifrado cambió, no rompemos la UI.
    }
    return {
      provider: row.provider,
      is_valid: row.is_valid,
      masked,
      created_at: row.created_at,
    };
  });
}

/**
 * Devuelve la API key en claro de un proveedor para el usuario actual.
 * Uso exclusivo en servidor (p.ej. justo antes de llamar al proveedor).
 */
export async function getDecryptedApiKey(
  provider: ApiKeyProvider,
): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('user_api_keys')
    .select('api_key_encrypted')
    .eq('provider', provider)
    .single();

  if (error || !data) return null;
  return decrypt(data.api_key_encrypted);
}
