import { NextResponse } from 'next/server';

import { borrarVencidos } from '@/lib/limpieza';
import { listPublic, removeObject } from '@/lib/storage';

export const runtime = 'nodejs';

/** Lista los videos guardados en la carpeta videos/. */
export async function GET() {
  // Por si el Cron diario no corrió: al abrir la app también se borran los
  // videos con más de 2 días. Usamos la misma lista (cada list() cuenta como
  // operación de Vercel Blob; antes se listaba tres veces por apertura).
  const blobs = await listPublic('videos/');
  const vencidos = await borrarVencidos(blobs).catch(() => new Set<string>());
  const items = blobs
    .filter((b) => !vencidos.has(b.url))
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
