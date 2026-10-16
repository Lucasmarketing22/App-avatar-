import { NextResponse } from 'next/server';

import { listPublic, readJson, removeObject } from '@/lib/storage';
import { fichaPropia, taskIdDeUrl } from '@/lib/tareas';
import type { Meta } from '@/app/api/meta/route';

export const runtime = 'nodejs';

/** Cuántas de las más nuevas traen sus datos de entrada (las demás se piden al abrirlas). */
const CON_DATOS = 60;

/**
 * "Mis creaciones" = los resultados guardados en la carpeta results/.
 * Adjuntamos el prompt/modelo exacto de cada imagen: de su ficha
 * (tareas/<taskId>.json) o, si es vieja, de config/meta.json.
 */
export async function GET() {
  const [blobs, meta] = await Promise.all([
    listPublic('results/'),
    readJson<Meta>('meta', {}),
  ]);
  const ordenados = blobs.sort((a, b) => b.uploadedAt - a.uploadedAt);
  const fichas = await Promise.all(
    ordenados.slice(0, CON_DATOS).map((b) => (meta[b.url] ? Promise.resolve(null) : fichaPropia(taskIdDeUrl(b.url)))),
  );
  const items = ordenados.map((b, i) => {
    const m = meta[b.url] ?? (fichas[i]?.prompt ? fichas[i] : undefined);
    return { id: b.pathname, url: b.url, ts: b.uploadedAt, prompt: m?.prompt, modelo: m?.modelo, refs: m?.refs, aspect: m?.aspect, credits: m?.credits };
  });
  return NextResponse.json({ items });
}

export async function DELETE(request: Request) {
  const url = new URL(request.url).searchParams.get('url');
  if (!url) return NextResponse.json({ error: 'Falta la imagen.' }, { status: 400 });
  await removeObject(url);
  return NextResponse.json({ ok: true });
}
