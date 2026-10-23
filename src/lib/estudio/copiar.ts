/**
 * "Copiar de una referencia": la usuaria sube una foto para replicarla y elige
 * qué se copia tal cual (peinado, uñas, vestuario, luz, estilo de la foto…).
 * La cara y la identidad SIEMPRE son las de su personaje. Cuantos más detalles
 * se le nombran a la IA, más fiel sale la copia.
 */
export type CopiaId =
  | 'peinado' | 'colorPelo' | 'maquillaje' | 'unas' | 'vestuario' | 'accesorios'
  | 'pose' | 'expresion' | 'escena' | 'luz' | 'encuadre' | 'estilo';

export type CopiaDef = {
  id: CopiaId;
  label: string;
  /** Qué copiar, en inglés, con todo el detalle que ayuda a la IA. */
  copiar: string;
  /** Qué hacer si NO se copia (en inglés). */
  noCopiar: string;
  /** Piezas del panel (vestido, peinados, luz…) que, si están elegidas, mandan sobre esta opción. */
  piezas?: string[];
};

export const COPIAS: CopiaDef[] = [
  { id: 'peinado', label: '💇 Peinado', piezas: ['peinados'],
    copiar: 'the exact hairstyle (cut, length, parting, volume, texture, how it falls, updo, braids, bangs and any hair accessories)',
    noCopiar: "the hairstyle (keep the person's own hairstyle from their reference images)" },
  { id: 'colorPelo', label: '🎨 Color de pelo',
    copiar: 'the exact hair color, including roots, highlights and tones',
    noCopiar: "the hair color (keep the person's own hair color)" },
  { id: 'maquillaje', label: '💄 Maquillaje',
    copiar: 'the exact makeup (eyeliner, lashes, eyeshadow, brows, blush, contour, lipstick color and finish)',
    noCopiar: 'the makeup' },
  { id: 'unas', label: '💅 Uñas',
    copiar: 'the exact nails (length, shape, color, finish and nail art)',
    noCopiar: 'the nails' },
  { id: 'vestuario', label: '👗 Vestuario', piezas: ['vestido'],
    copiar: 'the exact outfit (every garment, its color, fabric, fit, pattern, neckline, length and how it is worn)',
    noCopiar: 'the outfit' },
  { id: 'accesorios', label: '💍 Accesorios',
    copiar: 'the exact accessories and jewelry (earrings, necklaces, rings, bracelets, watch, glasses, hat, bag)',
    noCopiar: 'the accessories and jewelry' },
  { id: 'pose', label: '🤳 Pose', piezas: ['poses'],
    copiar: 'the exact pose and body position, including hand and finger positions, head tilt and gaze direction',
    noCopiar: 'the pose' },
  { id: 'expresion', label: '😊 Expresión', piezas: ['expresion'],
    copiar: "the exact facial expression (eyes, eyebrows, mouth, smile), reproduced on the person's own face",
    noCopiar: 'the facial expression' },
  { id: 'escena', label: '🏙️ Lugar y fondo', piezas: ['escenas'],
    copiar: 'the exact location and background, with every object, surface and color in it',
    noCopiar: 'the location and background' },
  { id: 'luz', label: '💡 Luz', piezas: ['luz', 'cine'],
    copiar: 'the exact lighting (direction, softness or hardness, color temperature, shadows, reflections and time of day)',
    noCopiar: 'the lighting' },
  { id: 'encuadre', label: '📐 Encuadre', piezas: ['encuadre'],
    copiar: 'the exact framing and crop, camera angle and height, distance, lens perspective, focus and depth of field',
    noCopiar: 'the framing and camera angle' },
  { id: 'estilo', label: '🎞️ Estilo de foto', piezas: ['estilo', 'cine'],
    copiar: 'the exact photographic look: color or black and white, color grading, film or camera type (for example polaroid, vintage, analog film, flash, phone selfie), grain, contrast, saturation, faded colors, vignette, and any border or frame of the photo',
    noCopiar: 'the photographic style and color grading' },
];

export const COPIA_IDS = COPIAS.map((c) => c.id);

/**
 * Instrucción (en inglés) para replicar la imagen `n` copiando lo elegido. Lo
 * que no se copia se nombra también, así la IA no lo trae "de arrastre".
 */
export function pistaCopia(n: number, elegidas: CopiaId[]): string {
  const si = COPIAS.filter((c) => elegidas.includes(c.id));
  const no = COPIAS.filter((c) => !elegidas.includes(c.id));
  const partes = [
    `Replicate image ${n} as faithfully as possible.`,
    "The face and identity must ALWAYS come from the person reference images, never from the person in image " + n + '.',
  ];
  if (si.length) partes.push(`From image ${n}, copy exactly: ${si.map((c) => c.copiar).join('; ')}.`);
  if (no.length) partes.push(`Do NOT copy from image ${n}: ${no.map((c) => c.noCopiar).join('; ')} — follow the other instructions for these.`);
  partes.push(`Match every visible detail of image ${n} that is selected above, as if it were the same photo taken again with this person.`);
  // El bloque de realismo general pide "foto de celular": si se copia la luz o el estilo de la foto, manda la foto.
  if (si.some((c) => c.id === 'estilo' || c.id === 'luz')) partes.push(`The lighting and photographic style copied from image ${n} take priority over any generic style or lighting instruction (for example if image ${n} is a studio, black and white, film, vintage or polaroid photo, keep exactly that look).`);
  return partes.join(' ');
}

/** Proporción más parecida (de las que ofrece la app) a la de una imagen. */
export function proporcionMasParecida(ancho: number, alto: number, opciones: string[]): string | null {
  if (!(ancho > 0 && alto > 0) || !opciones.length) return null;
  const r = ancho / alto;
  let mejor = opciones[0]; let dif = Infinity;
  for (const o of opciones) {
    const [a, b] = o.split(':').map(Number);
    const d = Math.abs(Math.log(r / (a / b)));
    if (d < dif) { dif = d; mejor = o; }
  }
  return mejor;
}
