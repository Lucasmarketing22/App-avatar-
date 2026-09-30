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
    key: 'cine',
    titulo: 'Look de cine',
    emoji: '🎥',
    opciones: [
      { id: 'amelie', label: 'Amélie', frag: 'cinematic movie color grade with warm saturated greens and reds, cozy Parisian golden glow, whimsical storybook mood' },
      { id: 'daysheaven', label: 'Atardecer épico', frag: 'magic-hour cinematography, warm golden backlight, soft amber sunlight, natural glowing tones' },
      { id: '2046', label: 'Romance (2046)', frag: 'moody saturated reds and warm ambers, intimate framing, soft haze and fine film grain, romantic melancholy' },
      { id: 'blade', label: 'Neón futurista', frag: 'neo-noir sci-fi look, teal and orange contrast, atmospheric haze and smoke, dramatic directional neon light' },
      { id: 'darkcity', label: 'Noir frío', frag: 'cold desaturated noir, deep shadows, blue-grey palette, misty and high contrast, mysterious' },
      { id: 'annihilation', label: 'Onírico', frag: 'dreamlike soft prismatic light, muted greens, hazy ethereal atmosphere, eerie beauty' },
      { id: 'clockwork', label: 'Clínico simétrico', frag: 'bright high-key clinical look, wide-angle, perfectly symmetrical composition, bold and unsettling calm' },
      { id: '2001', label: 'Sci-fi limpio', frag: 'clean minimal sci-fi, bright white environment with bold red accents, crisp symmetrical framing' },
      { id: 'wes', label: 'Simétrico pastel', frag: 'perfectly symmetrical centered composition, flat pastel color palette, whimsical storybook style' },
      { id: 'drive', label: 'Neón retro noche', frag: 'retro neon night, magenta and cyan glow, moody synthwave atmosphere, reflective wet streets' },
      { id: 'joker', label: 'Urbano melancólico', frag: 'gritty urban look, warm tungsten streetlights, slightly desaturated, melancholic cinematic grain' },
      { id: 'madmax', label: 'Desierto épico', frag: 'high-contrast desert look, intense orange and teal grade, harsh sunlight, dramatic and epic' },
      { id: 'her', label: 'Pastel cálido', frag: 'soft warm pastels, dreamy reds and pinks, gentle diffused light, intimate and tender' },
      { id: 'deakins', label: 'Silueta neón', frag: 'bold silhouettes against vibrant neon, glassy reflections, elegant high-contrast cinematography' },
      { id: 'sincity', label: 'Blanco y negro', frag: 'high-contrast black and white, deep blacks, dramatic noir shadows, stark' },
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
