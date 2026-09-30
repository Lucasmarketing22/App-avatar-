/**
 * Catálogo de "piezas" para armar la foto. Cada opción tiene:
 *  - id: identificador corto
 *  - label: lo que ve la usuaria (español)
 *  - frag: el fragmento en inglés que se suma al prompt
 *
 * Todo es opcional: lo que no se elige, no se menciona (el modelo decide).
 */
export type Opcion = { id: string; label: string; frag: string };
export type Categoria = { key: string; titulo: string; emoji: string; opciones: Opcion[] };

export const CATEGORIAS: Categoria[] = [
  {
    key: 'peinado',
    titulo: 'Peinado',
    emoji: '💇',
    opciones: [
      { id: 'suelto', label: 'Suelto natural', frag: 'her hair worn down, natural and slightly tousled' },
      { id: 'ondas', label: 'Ondas', frag: 'wavy hair worn down' },
      { id: 'lacio', label: 'Lacio', frag: 'sleek straight hair' },
      { id: 'rodete', label: 'Rodete', frag: 'hair styled in a loose bun' },
      { id: 'cola', label: 'Cola de caballo', frag: 'hair in a ponytail' },
      { id: 'trenza', label: 'Trenza', frag: 'hair in a braid' },
    ],
  },
  {
    key: 'expresion',
    titulo: 'Expresión',
    emoji: '😊',
    opciones: [
      { id: 'sonrisa', label: 'Sonrisa natural', frag: 'a natural genuine smile' },
      { id: 'suave', label: 'Sonrisa suave', frag: 'a soft subtle smile' },
      { id: 'seria', label: 'Seria', frag: 'a calm neutral expression' },
      { id: 'riendo', label: 'Riendo', frag: 'laughing candidly' },
      { id: 'camara', label: 'Mira a cámara', frag: 'looking directly at the camera' },
      { id: 'costado', label: 'Mira al costado', frag: 'looking away from the camera' },
    ],
  },
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
    key: 'escena',
    titulo: 'Escena',
    emoji: '🏙️',
    opciones: [
      { id: 'cafe', label: 'Café', frag: 'sitting in a cozy cafe' },
      { id: 'ciudad', label: 'Calle de ciudad', frag: 'on a city street' },
      { id: 'playa', label: 'Playa', frag: 'at the beach' },
      { id: 'parque', label: 'Parque', frag: 'in a green park outdoors' },
      { id: 'casa', label: 'En casa', frag: 'at home, cozy interior' },
      { id: 'resto', label: 'Restaurante', frag: 'in an elegant restaurant' },
      { id: 'liso', label: 'Fondo liso', frag: 'against a plain clean studio background' },
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
