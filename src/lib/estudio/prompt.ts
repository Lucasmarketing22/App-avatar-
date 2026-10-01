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
