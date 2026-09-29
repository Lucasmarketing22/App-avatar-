/**
 * Arma la instrucción (prompt) en inglés a partir de las piezas que elige la
 * usuaria. Por ahora la pieza es el "vestido": la app toma la cara del
 * personaje (imágenes de referencia) y le pone el vestido de la última imagen.
 *
 * La idea (igual que en los estudios de referencia): mantener la MISMA cara del
 * personaje y REEMPLAZAR la ropa por la del vestido elegido.
 */
export function componerPrompt(opts: { conVestido: boolean; nombre?: string }): string {
  const { conVestido } = opts;

  const base =
    'A photorealistic, high-resolution portrait photograph of the exact same young woman shown in the reference face images. ' +
    'Keep her face, identity, skin tone, freckles, eye color and hair color perfectly consistent with the reference images. ' +
    'Natural flattering lighting, realistic skin texture and fine detail, shot like a real lifestyle influencer photo.';

  if (conVestido) {
    return (
      base +
      ' She is wearing exactly the outfit/garment shown in the LAST reference image — replace her clothing completely with that garment, ' +
      'keeping the garment shape, color, fabric and details faithful. Three-quarter or full body framing so the outfit is clearly visible. ' +
      'Do not change her face.'
    );
  }

  return base + ' Simple, clean background. Head-and-shoulders framing.';
}
