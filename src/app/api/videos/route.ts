import { NextResponse } from 'next/server';

import { listPublic } from '@/lib/storage';

export const runtime = 'nodejs';

/** Lista los videos guardados en la carpeta videos/. */
export async function GET() {
  const blobs = await listPublic('videos/');
  const items = blobs
    .sort((a, b) => b.uploadedAt - a.uploadedAt)
    .map((b) => ({ id: b.pathname, url: b.url, ts: b.uploadedAt }));
  return NextResponse.json({ items });
}
