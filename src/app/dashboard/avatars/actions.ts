'use server';

import { revalidatePath } from 'next/cache';

import { createAvatar, deleteAvatar } from '@/lib/avatars';

export type AvatarState = { error?: string; message?: string };

/** Crea un avatar a partir del formulario (nombre + archivo de imagen). */
export async function uploadAvatar(
  _prev: AvatarState,
  formData: FormData,
): Promise<AvatarState> {
  const name = String(formData.get('name') ?? '');
  const file = formData.get('file');

  if (!(file instanceof File)) {
    return { error: 'Adjunta una imagen de referencia.' };
  }

  const { error } = await createAvatar(name, file);
  if (error) return { error };

  revalidatePath('/dashboard/avatars');
  revalidatePath('/dashboard');
  return { message: 'Avatar creado.' };
}

/** Elimina un avatar (archivo + fila). */
export async function removeAvatar(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  await deleteAvatar(id);
  revalidatePath('/dashboard/avatars');
  revalidatePath('/dashboard');
}
