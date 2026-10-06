/**
 * Catálogo de "piezas" con botones (opciones de texto). Las categorías con FOTO
 * (peinados, poses, escenas, looks de cine) viven en galerias.ts.
 */
export type Opcion = { id: string; label: string; frag: string };
export type Categoria = { key: string; titulo: string; emoji: string; opciones: Opcion[] };

export const CATEGORIAS: Categoria[] = [
  {
    key: 'luz',
    titulo: 'Luz',
    emoji: '💡',
    opciones: [
      { id: 'dia', label: 'Día natural', frag: 'soft natural daylight' },
      { id: 'dorada', label: 'Atardecer', frag: 'warm golden hour sunlight' },
      { id: 'interior', label: 'Interior cálido', frag: 'warm cozy indoor lighting' },
      { id: 'estudio', label: 'Estudio', frag: 'soft even studio lighting' },
      { id: 'flash', label: 'Flash de noche', frag: 'direct on-camera flash at night' },
      { id: 'neon', label: 'Neón', frag: 'colorful neon night lighting' },
    ],
  },
  {
    key: 'estilo',
    titulo: 'Estilo de foto',
    emoji: '🎬',
    opciones: [
      { id: 'real', label: 'Foto realista', frag: 'candid realistic smartphone photo look' },
      { id: 'editorial', label: 'Editorial', frag: 'high-end editorial fashion magazine photography' },
      { id: 'cine', label: 'Cine', frag: 'cinematic film still, shallow depth of field, moody color grading' },
      { id: 'film', label: 'Analógico', frag: 'shot on 35mm film, subtle grain, natural colors' },
    ],
  },
  {
    key: 'encuadre',
    titulo: 'Encuadre',
    emoji: '🖼️',
    opciones: [
      { id: 'primer', label: 'Primer plano', frag: 'close-up portrait, head and shoulders' },
      { id: 'medio', label: 'Medio cuerpo', frag: 'waist-up medium shot' },
      { id: 'entero', label: 'Cuerpo entero', frag: 'full body shot' },
    ],
  },
];

export type Selecciones = Record<string, string | undefined>;

/** Devuelve los fragmentos en inglés de las piezas elegidas. */
export function fragmentosDe(sel: Selecciones): string[] {
  const out: string[] = [];
  for (const cat of CATEGORIAS) {
    const id = sel[cat.key];
    if (!id) continue;
    const op = cat.opciones.find((o) => o.id === id);
    if (op) out.push(op.frag);
  }
  return out;
}
