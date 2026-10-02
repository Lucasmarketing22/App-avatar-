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
      'Avoid any plastic, waxy, airbrushed, over-smooth, over-saturated, CGI, 3D-render, beauty-filter or AI-generated look.',
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
    `Absolutely avoid any plastic, waxy, airbrushed, over-smooth, over-saturated, CGI, 3D-render or AI-generated look.\n\n` +
    `Instructions: ${instrucciones}`
  );
}
