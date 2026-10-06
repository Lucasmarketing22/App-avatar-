import { NextResponse } from 'next/server';

import { listPublic, readJson, removeObject } from '@/lib/storage';
import type { Meta } from '@/app/api/meta/route';

export const runtime = 'nodejs';

/**
 * "Mis creaciones" = los resultados guardados en la carpeta results/.
 * Adjuntamos el prompt/modelo exacto de cada imagen (desde config/meta.json).
 */
export async function GET() {
  const [blobs, meta] = await Promise.all([
    listPublic('results/'),
    readJson<Meta>('meta', {}),
  ]);
  const items = blobs
    .sort((a, b) => b.uploadedAt - a.uploadedAt)
    .map((b) => ({ id: b.pathname, url: b.url, ts: b.uploadedAt, prompt: meta[b.url]?.prompt, modelo: meta[b.url]?.modelo, refs: meta[b.url]?.refs, aspect: meta[b.url]?.aspect }));
  return NextResponse.json({ items });
}

export async function DELETE(request: Request) {
  const url = new URL(request.url).searchParams.get('url');
  if (!url) return NextResponse.json({ error: 'Falta la imagen.' }, { status: 400 });
  await removeObject(url);
  return NextResponse.json({ ok: true });
}
