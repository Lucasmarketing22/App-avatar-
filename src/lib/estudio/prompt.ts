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
    'Ultra realistic and natural, with real skin texture (visible pores and tiny natural imperfections), ' +
      'natural catchlights in the eyes, realistic lighting and soft shadows, natural depth of field. ' +
      'It should look like a genuine candid photo taken on a modern smartphone, not retouched. ' +
      'Avoid any plastic, waxy, airbrushed, over-smooth, over-saturated, CGI, 3D-render or AI-generated look.',
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
    'Recreate image 1 exactly (same scene, background, pose, lighting, framing and composition). The woman must be the woman shown in image 2 (same face and identity). Keep the same outfit and setting as image 1.';
  const lista = Array.from({ length: Math.max(nImgs, 1) }, (_, i) => `image ${i + 1}`).join(', ');
  return (
    `Photorealistic photo edit. Use the provided reference images in order (${lista}). ` +
    `Follow the instructions below exactly and change only what they ask, preserving everything else from the base image. ` +
    `Keep the result fully photographic and realistic: real skin texture with visible pores and tiny natural imperfections, natural lighting and soft shadows, natural depth of field, like a genuine camera photo. ` +
    `Absolutely avoid any plastic, waxy, airbrushed, over-smooth, over-saturated, CGI, 3D-render or AI-generated look.\n\n` +
    `Instructions: ${instrucciones}`
  );
}
