import { NextResponse } from 'next/server';
import sharp from 'sharp';

import { uploadPublic } from '@/lib/storage';
import { GALERIA_KEYS } from '@/lib/estudio/galerias';

export const runtime = 'nodejs';

const CARPETAS = ['personaje', 'vestidos', 'refs', ...GALERIA_KEYS];

const TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'No llegó ninguna imagen.' }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'La imagen supera el límite de 10 MB.' }, { status: 400 });
  }
  const ext = TYPES[file.type];
  if (!ext) {
    return NextResponse.json({ error: 'Formato no soportado (usá PNG, JPG o WEBP).' }, { status: 400 });
  }

  // Carpeta destino permitida.
  const rawFolder = String(form?.get('folder') ?? 'refs');
  const folder = CARPETAS.includes(rawFolder) ? rawFolder : 'refs';

  // Achicamos a 2048px como máximo (de sobra para la IA) y enderezamos según la
  // orientación del celular. Fotos de 5-10 MB hacían que la IA tardara más en
  // descargar las referencias en cada generación. Si falla, va la original.
  let bytes = new Uint8Array(await file.arrayBuffer());
  let tipo = file.type;
  let extFinal = ext;
  try {
    const chica = await sharp(Buffer.from(bytes))
      .rotate()
      .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 92 })
      .toBuffer();
    if (chica.length < bytes.length) { bytes = new Uint8Array(chica); tipo = 'image/jpeg'; extFinal = 'jpg'; }
  } catch { /* usamos la original */ }

  const { url, error } = await uploadPublic(`${folder}/${crypto.randomUUID()}.${extFinal}`, bytes, tipo);
  if (error || !url) {
    return NextResponse.json({ error: `No se pudo guardar la imagen: ${error ?? 'desconocido'}` }, { status: 500 });
  }
  return NextResponse.json({ url });
}
