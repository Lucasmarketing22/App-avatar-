'use server';

import { revalidatePath } from 'next/cache';

import { deleteApiKey as deleteApiKeyService, upsertApiKey } from '@/lib/api-keys';
import { validateProviderKey, type ValidationStatus } from '@/lib/providers';
import type { ApiKeyProvider } from '@/lib/database.types';

const PROVIDER_IDS: ApiKeyProvider[] = ['fal', 'higgsfield', 'replicate'];

function parseProvider(value: FormDataEntryValue | null): ApiKeyProvider | null {
  const v = String(value ?? '');
  return (PROVIDER_IDS as string[]).includes(v) ? (v as ApiKeyProvider) : null;
}

export type SaveKeyState = {
  provider?: ApiKeyProvider;
  status?: ValidationStatus;
  error?: string;
  message?: string;
};

/**
 * Valida y guarda (cifrada) la API key de un proveedor.
 * is_valid se persiste segun el resultado de la verificacion.
 */
export async function saveApiKey(
  _prev: SaveKeyState,
  formData: FormData,
): Promise<SaveKeyState> {
  const provider = parseProvider(formData.get('provider'));
  const key = String(formData.get('api_key') ?? '').trim();

  if (!provider) return { error: 'Proveedor no válido.' };
  if (!key) return { provider, error: 'Introduce una API key.' };

  const result = await validateProviderKey(provider, key);

  if (result.status === 'invalid') {
    return { provider, status: 'invalid', error: result.detail };
  }

  const { error } = await upsertApiKey(provider, key, result.status === 'valid');
  if (error) return { provider, error };

  revalidatePath('/dashboard/api-keys');
  revalidatePath('/dashboard');
  return { provider, status: result.status, message: result.detail };
}

/** Elimina la API key de un proveedor. */
export async function removeApiKey(formData: FormData): Promise<void> {
  const provider = parseProvider(formData.get('provider'));
  if (!provider) return;
  await deleteApiKeyService(provider);
  revalidatePath('/dashboard/api-keys');
  revalidatePath('/dashboard');
}
