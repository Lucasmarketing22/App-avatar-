'use server';

import { revalidatePath } from 'next/cache';

import { runGeneration } from '@/lib/generation';
import type { ApiKeyProvider } from '@/lib/database.types';

const PROVIDER_IDS: ApiKeyProvider[] = ['fal', 'higgsfield', 'replicate'];

function parseProvider(value: FormDataEntryValue | null): ApiKeyProvider | null {
  const v = String(value ?? '');
  return (PROVIDER_IDS as string[]).includes(v) ? (v as ApiKeyProvider) : null;
}

export type GenerateState = { error?: string; message?: string };

export async function generate(
  _prev: GenerateState,
  formData: FormData,
): Promise<GenerateState> {
  const provider = parseProvider(formData.get('provider'));
  const prompt = String(formData.get('prompt') ?? '').trim();
  const avatarId = String(formData.get('avatar_id') ?? '') || null;

  if (!provider) return { error: 'Selecciona un proveedor.' };
  if (!prompt) return { error: 'El prompt no puede estar vacío.' };

  const outcome = await runGeneration({ provider, prompt, avatarId });

  revalidatePath('/dashboard/generate');
  revalidatePath('/dashboard');

  if (outcome.status !== 'succeeded') {
    return { error: outcome.error ?? 'La generación falló.' };
  }
  return { message: '¡Imagen generada!' };
}
