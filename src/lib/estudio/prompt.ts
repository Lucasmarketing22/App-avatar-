import { fragmentosDe, type Selecciones } from './piezas';

/**
 * Arma la instrucción (prompt) en inglés.
 * - Mantiene la MISMA cara del personaje (imágenes de referencia de la cara).
 * - `hints`: descripciones (en inglés) de qué representa cada imagen de
 *   referencia extra adjuntada (vestido, peinado, pose, escena, look de cine).
 * - Empuja fuerte al realismo para que no quede con aspecto "IA".
 */
export function componerPrompt(opts: {
  hints?: string[];
  selecciones?: Selecciones;
  extra?: string;
}): string {
  const { hints = [], selecciones = {}, extra } = opts;

  const partes: string[] = [];

  partes.push(
    'A candid, photorealistic photograph of the exact same real woman shown in the person reference images. ' +
      'Keep her face, identity, bone structure, skin tone, freckles, eye color and natural features perfectly consistent with the person reference images. Do not change her face.',
  );

  // Pistas de las imágenes de referencia adjuntas (vestido, peinado, etc.).
  for (const h of hints) {
    const t = h.trim();
    if (t) partes.push(t);
  }

  // Piezas de texto (expresión, luz, estilo, encuadre).
  const frags = fragmentosDe(selecciones);
  if (frags.length) partes.push(frags.join(', ') + '.');

  // Detalle libre.
  const ex = (extra ?? '').trim();
  if (ex) partes.push(ex);

  // Realismo (siempre).
  partes.push(
    'Ultra realistic and natural, with real skin texture (clearly visible pores, fine lines and small natural imperfections, not uniform skin). ' +
      'Do NOT smooth, retouch, beautify or over-light the skin. Imperfect, uneven natural lighting with real shadows, no glossy or waxy highlights. ' +
      'It should look like a raw, candid amateur photo taken on a modern smartphone, slightly imperfect, not retouched. ' +
      'Avoid any plastic, waxy, airbrushed, over-smooth, over-saturated, CGI, 3D-render, beauty-filter or AI-generated look. ' +
      'Technical quality must be high: high resolution, crisp and in sharp focus on her face and eyes, with rich fine detail and correct anatomy. No blur, no motion blur, no noise, no lowres, no jpeg artifacts, no distortion, no extra or deformed fingers.',
  );

  return partes.join(' ');
}

/**
 * Editor libre con cajas de imágenes. Las imágenes van en orden (image 1,
 * image 2, …) y la usuaria escribe qué hacer refiriéndose a ellas. Anclar a una
 * FOTO REAL (image 1) y cambiar lo mínimo es lo que da realismo (como Flow).
 */
export function componerEditor(texto: string, nImgs: number): string {
  const instrucciones = texto.trim() ||
    'Create a new photorealistic photo of the same woman shown in the reference images, keeping her exact face and identity.';
  const lista = Array.from({ length: Math.max(nImgs, 1) }, (_, i) => `image ${i + 1}`).join(', ');
  return (
    `Photorealistic image generation. Use the provided reference images, in order (${lista}), ONLY as references. ` +
    `Do EXACTLY what the instructions below say and generate the image they describe. ` +
    `Use each reference image for whatever the instructions refer to (for example the person's face and identity, an outfit, or a pose). ` +
    `IMPORTANT: if the instructions ask for a new scene, pose, outfit, background or action, actually CREATE that new image — do NOT just copy, reproduce or output one of the reference images. ` +
    `Only reproduce a reference image when the instructions explicitly say to recreate it. ` +
    `Always keep the woman's face and identity consistent with the person reference image (same face, bone structure, skin tone, freckles, eye color and natural features). Do not change her face. ` +
    `Keep the result fully photographic and realistic: real skin texture with clearly visible pores, fine lines and small natural imperfections (not uniform or perfect skin). ` +
    `Do NOT smooth, retouch, beautify, soften or over-light the skin. Imperfect, uneven natural lighting with real shadows — no glossy, waxy or glowing highlights. ` +
    `Make it look like a raw, candid amateur smartphone snapshot, slightly imperfect, NOT a polished studio shot or an AI/beauty-filter image. ` +
    `Absolutely avoid any plastic, waxy, airbrushed, over-smooth, over-saturated, CGI, 3D-render or AI-generated look. ` +
    `Technical quality must be high: high resolution, crisp and in sharp focus on her face and eyes, rich fine detail and correct anatomy. No blur, no motion blur, no noise, no lowres, no jpeg artifacts, no distortion, no extra or deformed fingers.\n\n` +
    `Instructions: ${instrucciones}`
  );
}

const REALISMO =
  'Keep it fully photographic and realistic: real skin texture with clearly visible pores, fine lines and small natural imperfections (not uniform or perfect skin). ' +
  'Do NOT smooth, retouch, beautify, soften or over-light the skin. Imperfect, uneven natural lighting with real shadows — no glossy, waxy or glowing highlights. ' +
  'Make it look like a raw, candid amateur smartphone snapshot, NOT a polished studio shot or an AI/beauty-filter image. ' +
  'Avoid any plastic, waxy, airbrushed, over-smooth, over-saturated, CGI, 3D-render or AI-generated look. ' +
  'High resolution, crisp and in sharp focus on her face and eyes, rich fine detail and correct anatomy. No blur, noise, lowres, jpeg artifacts, distortion or deformed fingers.';

/**
 * Panel unificado (estilo Aria): combina las REFERENCIAS @imagen (numeradas),
 * la cara del personaje, las piezas (vestido/pose/escena…) y las categorías de
 * texto, en una sola instrucción con un solo Generar.
 */
export function componerUnificado(opts: {
  texto: string;
  nRefs: number;
  hints?: string[];
  selecciones?: Selecciones;
}): string {
  const { texto, nRefs, hints = [], selecciones = {} } = opts;
  const instrucciones = texto.trim() ||
    'Create a new photorealistic photo of the same woman shown in the reference images, keeping her exact face and identity.';
  const partes: string[] = [];

  partes.push('Photorealistic image generation using the provided reference images.');
  if (nRefs > 0) {
    const lista = Array.from({ length: nRefs }, (_, i) => `image ${i + 1}`).join(', ');
    partes.push(`The first reference images, named in order (${lista}), are the ones the instructions below refer to.`);
  }
  partes.push(
    "The remaining reference images show, as noted, the woman's face and identity, and when provided her outfit, hairstyle, pose or scene — use each one for what it represents.",
  );
  partes.push(
    "Always keep the woman's face and identity consistent with the person reference image (same face, bone structure, skin tone, freckles, eye color and natural features). Do not change her face.",
  );

  for (const h of hints) { const t = h.trim(); if (t) partes.push(t); }

  const frags = fragmentosDe(selecciones);
  if (frags.length) partes.push(frags.join(', ') + '.');

  partes.push(REALISMO);

  partes.push(`Instructions: ${instrucciones}`);
  return partes.join(' ');
}

/**
 * Contextura del personaje (ej: "100-60-95, curvilínea"). Las curvas van solo
 * en el cuerpo: si no se aclara, la IA tiende a redondearle también la cara.
 */
export function pistaCuerpo(cuerpo?: string): string {
  const c = (cuerpo ?? '').trim();
  if (!c) return '';
  return `Her body shape and measurements must be exactly: ${c}. Apply these proportions ONLY to her body; her face must stay exactly the same as in the face reference images (do not make the face rounder, wider or fuller).`;
}

/** Encuadres para adaptar la foto del avatar al video de Motion. */
export const ENCUADRES = {
  cara: 'a close-up portrait framing her face, neck and shoulders, looking at the camera',
  medio: 'a medium shot from the waist up',
  entero: 'a full-body shot from head to toes, standing, with some space around her',
} as const;
export type Encuadre = keyof typeof ENCUADRES;

/**
 * Sesión de fotos: a partir de una foto ya creada (image 1), otras tomas del
 * MISMO set — mismo escenario, luz, ropa y peinado — cambiando pose y encuadre.
 * Cada toma es un pedido distinto para que las fotos salgan variadas.
 */
export const TOMAS_SESION: string[] = [
  'a full body shot showing her whole outfit from head to toe, standing in a relaxed natural pose, camera at chest height',
  'a close-up portrait of her face and shoulders, looking at the camera with a soft natural expression',
  'a medium shot from a three-quarter side angle, walking or moving naturally, a candid moment as if she did not notice the camera',
  'a medium shot of her sitting or leaning on something in the same place, relaxed pose, looking away from the camera',
];

export function componerSesion(toma: string, conCaras: boolean, cuerpo?: string): string {
  const partes: string[] = [
    'Photorealistic photoshoot continuation. Image 1 is a photo from an ongoing photo session.',
    'Keep EXACTLY the same location, background and setting, the same lighting, weather and time of day, and the same outfit (every garment, color, fabric, pattern and accessory) and the same hairstyle and makeup as in image 1.',
    conCaras
      ? "The other reference images show the woman's face and identity: keep her face exactly the same (same face, bone structure, skin tone, freckles, eye color and natural features)."
      : 'Keep the woman exactly the same person as in image 1 (same face, bone structure, skin tone, freckles, eye color and natural features).',
    `Create a NEW, different photo from this same session: ${toma}. Do not copy the pose, angle or framing of image 1.`,
    pistaCuerpo(cuerpo),
    REALISMO,
  ];
  return partes.filter(Boolean).join(' ');
}

/**
 * Motion con instrucciones: antes del video se crea una foto NUEVA del avatar
 * (image 1) con el cambio pedido (vestuario, pelo…), manteniendo cara, pose y
 * encuadre para que sirva de cuadro inicial del video.
 */
export function componerCambioAvatar(
  instrucciones: string,
  conCaras: boolean,
  extra?: { cuerpo?: string; encuadre?: Encuadre },
): string {
  const instr = instrucciones.trim();
  return [
    'Photorealistic edit of image 1.',
    'Keep EXACTLY the same woman: same face, identity, bone structure, skin tone, freckles, eye color and natural features.',
    conCaras ? 'The other reference images show her face and identity; keep her face exactly the same.' : '',
    extra?.encuadre
      ? `Reframe the photo as ${ENCUADRES[extra.encuadre]}, keeping the same outfit, hair and setting style, so it can be used as the first frame of a video with that framing.`
      : 'Keep the same pose, body position, framing, camera angle and composition as image 1, so it can be used as the first frame of a video.',
    instr ? `Apply ONLY this change and keep everything else unchanged: ${instr}.` : '',
    pistaCuerpo(extra?.cuerpo),
    REALISMO,
  ].filter(Boolean).join(' ');
}
