'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { composePrompt } from '@/lib/prompt-builder';
import type { PromptBlockCategory } from '@/lib/database.types';

const CATEGORIES: PromptBlockCategory[] = [
  'accion',
  'expresion',
  'encuadre',
  'locacion',
  'iluminacion',
  'outfit',
  'estilo',
];

function parseCategory(
  value: FormDataEntryValue | null,
): PromptBlockCategory | null {
  const v = String(value ?? '');
  return (CATEGORIES as string[]).includes(v) ? (v as PromptBlockCategory) : null;
}

export type ActionState = { error?: string; message?: string };

async function requireUser() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** Crea un bloque de prompt personalizado del usuario. */
export async function createCustomBlock(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: 'No autenticado.' };

  const category = parseCategory(formData.get('category'));
  const label = String(formData.get('label') ?? '').trim();
  const prompt_fragment = String(formData.get('prompt_fragment') ?? '').trim();

  if (!category) return { error: 'Categoría no válida.' };
  if (!label || !prompt_fragment) {
    return { error: 'Completa el nombre y el fragmento del prompt.' };
  }

  const { error } = await supabase.from('prompt_blocks').insert({
    category,
    label,
    prompt_fragment,
    is_custom: true,
    user_id: user.id,
  });

  if (error) return { error: error.message };

  revalidatePath('/dashboard/prompt-builder');
  return { message: 'Bloque creado.' };
}

/** Elimina un bloque personalizado del usuario (los globales no se pueden). */
export async function deleteCustomBlock(formData: FormData): Promise<void> {
  const { supabase, user } = await requireUser();
  if (!user) return;

  const id = String(formData.get('id') ?? '');
  if (!id) return;

  // La policy RLS ya impide borrar bloques que no sean del usuario.
  await supabase.from('prompt_blocks').delete().eq('id', id);
  revalidatePath('/dashboard/prompt-builder');
}

/** Guarda un preset con los bloques seleccionados y el prompt cacheado. */
export async function savePreset(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: 'No autenticado.' };

  const name = String(formData.get('name') ?? '').trim();
  const blockIds = formData
    .getAll('block_ids')
    .map((v) => String(v))
    .filter(Boolean);

  if (!name) return { error: 'Ponle un nombre al preset.' };
  if (blockIds.length === 0) {
    return { error: 'Selecciona al menos un bloque.' };
  }

  // Recalcular el prompt en el servidor a partir de los bloques accesibles
  // por el usuario (catalogo global + sus custom), asi el cache es fiable.
  const { data: blocks, error: blocksError } = await supabase
    .from('prompt_blocks')
    .select('*')
    .in('id', blockIds);

  if (blocksError) return { error: blocksError.message };

  const final_prompt_text = composePrompt(blocks ?? [], blockIds);

  const { error } = await supabase.from('saved_presets').insert({
    user_id: user.id,
    name,
    block_ids: blockIds,
    final_prompt_text,
  });

  if (error) return { error: error.message };

  revalidatePath('/dashboard/prompt-builder');
  return { message: 'Preset guardado.' };
}

/** Elimina un preset del usuario. */
export async function deletePreset(formData: FormData): Promise<void> {
  const { supabase, user } = await requireUser();
  if (!user) return;

  const id = String(formData.get('id') ?? '');
  if (!id) return;

  await supabase.from('saved_presets').delete().eq('id', id);
  revalidatePath('/dashboard/prompt-builder');
}
