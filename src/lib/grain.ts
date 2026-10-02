import 'server-only';

import sharp from 'sharp';

/**
 * Agrega un grano fotográfico sutil a la imagen (ruido gaussiano en modo
 * "soft-light"). Le saca el brillo plástico y la acerca a una foto real, sin
 * tocar la identidad (el grano es parejo en toda la imagen). Devuelve un JPEG;
 * si algo falla, devuelve null y se usa la imagen original.
 */
export async function aplicarGrano(bytes: Uint8Array): Promise<Buffer | null> {
  try {
    const meta = await sharp(Buffer.from(bytes)).metadata();
    const w = meta.width ?? 1024;
    const h = meta.height ?? 1024;
    const noise = await sharp({
      create: { width: w, height: h, channels: 3, background: { r: 0, g: 0, b: 0 }, noise: { type: 'gaussian', mean: 128, sigma: 9 } },
    })
      .png()
      .toBuffer();
    return await sharp(Buffer.from(bytes))
      .composite([{ input: noise, blend: 'soft-light' }])
      .jpeg({ quality: 92 })
      .toBuffer();
  } catch {
    return null;
  }
}
