import { NextResponse } from 'next/server';

import { listPublic, removeObject } from '@/lib/storage';

export const runtime = 'nodejs';

/** Lista los videos guardados en la carpeta videos/. */
export async function GET() {
  const blobs = await listPublic('videos/');
  const items = blobs
    .sort((a, b) => b.uploadedAt - a.uploadedAt)
    .map((b) => ({ id: b.pathname, url: b.url, ts: b.uploadedAt }));
  return NextResponse.json({ items });
}

/** Borra un video por su URL. */
export async function DELETE(request: Request) {
  const url = new URL(request.url).searchParams.get('url');
  if (!url) return NextResponse.json({ error: 'Falta el video.' }, { status: 400 });
  await removeObject(url);
  return NextResponse.json({ ok: true });
}
