import { fragmentosDe, type Selecciones } from './piezas';

/**
 * Arma la instrucción (prompt) en inglés a partir de las piezas que elige la
 * usuaria. Mantiene la MISMA cara del personaje (imágenes de referencia) y,
 * si hay vestido elegido, REEMPLAZA la ropa por la del vestido.
 *
 * Objetivo clave: que salga REALISTA (no con aspecto "IA"/plástico). Por eso el
 * prompt insiste en textura de piel real, luz natural y look de foto de celular.
 */
export function componerPrompt(opts: {
  conVestido: boolean;
  selecciones?: Selecciones;
  extra?: string;
}): string {
  const { conVestido, selecciones = {}, extra } = opts;

  const partes: string[] = [];

  // Identidad (cara consistente).
  partes.push(
    'A candid, photorealistic photograph of the exact same real woman shown in the reference face images. ' +
      'Keep her face, identity, bone structure, skin tone, freckles, eye color and natural features perfectly consistent with the reference images.',
  );

  // Vestido (reemplazo de ropa con la última imagen de referencia).
  if (conVestido) {
    partes.push(
      'She is wearing exactly the outfit shown in the LAST reference image — replace her clothing completely with that garment, ' +
        'keeping its shape, color, fabric and details faithful.',
    );
  }

  // Piezas elegidas (peinado, expresión, luz, escena, estilo, encuadre).
  const frags = fragmentosDe(selecciones);
  if (frags.length) partes.push(frags.join(', ') + '.');

  // Detalle libre de la usuaria.
  const ex = (extra ?? '').trim();
  if (ex) partes.push(ex);

  // Empuje de realismo (siempre).
  partes.push(
    'Ultra realistic and natural, with real skin texture (visible pores and tiny natural imperfections), ' +
      'natural catchlights in the eyes, realistic lighting and soft shadows, natural depth of field. ' +
      'It should look like a genuine candid photo taken on a modern smartphone, not retouched. ' +
      'Avoid any plastic, waxy, airbrushed, over-smooth, over-saturated, CGI, 3D-render or AI-generated look. ' +
      'Do not change her face.',
  );

  return partes.join(' ');
}
