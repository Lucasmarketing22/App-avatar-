import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { decrypt, encrypt } from '@/lib/encryption';
import type { ApiKeyProvider } from '@/lib/database.types';

/**
 * Capa de servicio para las API keys BYOK. La API key en claro NUNCA sale del
 * servidor: se cifra antes de guardarla y solo se descifra en el servidor
 * cuando hay que llamar al proveedor externo.
 */

/** Guarda (o reemplaza) la API key de un proveedor para el usuario actual. */
export async function upsertApiKey(
  provider: ApiKeyProvider,
  plaintextKey: string,
): Promise<{ error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'No autenticado.' };

  const api_key_encrypted = encrypt(plaintextKey);

  const { error } = await supabase.from('user_api_keys').upsert(
    {
      user_id: user.id,
      provider,
      api_key_encrypted,
      is_valid: false, // se validara contra el proveedor en un paso aparte
    },
    { onConflict: 'user_id,provider' },
  );

  if (error) return { error: error.message };
  return {};
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
