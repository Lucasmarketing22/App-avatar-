import 'server-only';

import sharp from 'sharp';

/**
 * Agrega un grano fotográfico sutil a la imagen (ruido gaussiano en modo
 * "soft-light"). Le saca el brillo plástico y la acerca a una foto real, sin
 * tocar la identidad (el grano es parejo en toda la imagen). Devuelve un JPEG;
 * si algo falla, devuelve null y se usa la imagen original.
 *
 * El ruido es un "azulejo" chico que se repite (medida impar para que no se
 * note el patrón). Generar ruido para una foto 4K entera tardaba varios
 * segundos por imagen; así es ~4 veces más rápido y se ve igual.
 */
let azulejo: Promise<Buffer> | null = null;
function ruido(): Promise<Buffer> {
  azulejo ??= sharp({
    create: { width: 509, height: 509, channels: 3, background: { r: 0, g: 0, b: 0 }, noise: { type: 'gaussian', mean: 128, sigma: 9 } },
  })
    .png()
    .toBuffer();
  return azulejo;
}

export async function aplicarGrano(bytes: Uint8Array): Promise<Buffer | null> {
  try {
    return await sharp(Buffer.from(bytes))
      .composite([{ input: await ruido(), tile: true, blend: 'soft-light' }])
      .jpeg({ quality: 92 })
      .toBuffer();
  } catch {
    azulejo = null;
    return null;
  }
}
