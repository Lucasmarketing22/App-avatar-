import type { Database, PromptBlockCategory } from '@/lib/database.types';

/**
 * Utilidades puras del Prompt Builder (sin acceso a red ni a Supabase), para
 * poder reutilizarlas tanto en cliente como en servidor.
 */

export type PromptBlock = Database['public']['Tables']['prompt_blocks']['Row'];
export type SavedPreset = Database['public']['Tables']['saved_presets']['Row'];

/** Orden y etiquetas visibles de las categorias en la UI. */
export const CATEGORY_ORDER: PromptBlockCategory[] = [
  'accion',
  'expresion',
  'encuadre',
  'locacion',
  'iluminacion',
  'outfit',
  'estilo',
];

export const CATEGORY_LABELS: Record<PromptBlockCategory, string> = {
  accion: 'Acción',
  expresion: 'Expresión',
  encuadre: 'Encuadre',
  locacion: 'Locación',
  iluminacion: 'Iluminación',
  outfit: 'Outfit',
  estilo: 'Estilo',
};

/**
 * Compone el prompt maestro a partir de los bloques seleccionados,
 * respetando el orden canonico de categorias. Une los fragmentos con comas.
 */
export function composePrompt(blocks: PromptBlock[], selectedIds: string[]): string {
  const selected = selectedIds
    .map((id) => blocks.find((b) => b.id === id))
    .filter((b): b is PromptBlock => Boolean(b));

  const orderIndex = (c: PromptBlockCategory) => CATEGORY_ORDER.indexOf(c);
  const sorted = [...selected].sort(
    (a, b) => orderIndex(a.category) - orderIndex(b.category),
  );

  return sorted
    .map((b) => b.prompt_fragment.trim())
    .filter(Boolean)
    .join(', ');
}

/** Agrupa bloques por categoria en el orden canonico. */
export function groupByCategory(
  blocks: PromptBlock[],
): { category: PromptBlockCategory; blocks: PromptBlock[] }[] {
  return CATEGORY_ORDER.map((category) => ({
    category,
    blocks: blocks.filter((b) => b.category === category),
  }));
}
