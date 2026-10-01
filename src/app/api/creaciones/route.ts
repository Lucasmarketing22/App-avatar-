import { NextResponse } from 'next/server';

import { listPublic, removeObject } from '@/lib/storage';

export const runtime = 'nodejs';

/**
 * "Mis creaciones" = los resultados guardados en la carpeta results/.
 * Listamos la carpeta directamente (no un archivo índice), así nunca se pisan
 * ni se pierden al generar varias seguidas.
 */
export async function GET() {
  const blobs = await listPublic('results/');
  const items = blobs
    .sort((a, b) => b.uploadedAt - a.uploadedAt)
    .map((b) => ({ id: b.pathname, url: b.url, ts: b.uploadedAt }));
  return NextResponse.json({ items });
}

export async function DELETE(request: Request) {
  const url = new URL(request.url).searchParams.get('url');
  if (!url) return NextResponse.json({ error: 'Falta la imagen.' }, { status: 400 });
  await removeObject(url);
  return NextResponse.json({ ok: true });
}
