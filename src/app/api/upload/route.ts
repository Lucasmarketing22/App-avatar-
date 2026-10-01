import { NextResponse } from 'next/server';

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

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { url, error } = await uploadPublic(`${folder}/${crypto.randomUUID()}.${ext}`, bytes, file.type);
  if (error || !url) {
    return NextResponse.json({ error: `No se pudo guardar la imagen: ${error ?? 'desconocido'}` }, { status: 500 });
  }
  return NextResponse.json({ url });
}
