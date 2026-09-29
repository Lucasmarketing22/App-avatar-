import { NextResponse } from 'next/server';

import { readJson, writeJson } from '@/lib/storage';

export const runtime = 'nodejs';

export type Creacion = { id: string; url: string; ts: number };
type Galeria = { items: Creacion[] };

const VACIO: Galeria = { items: [] };

export async function GET() {
  const g = await readJson<Galeria>('creaciones', VACIO);
  return NextResponse.json(g);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { url?: string } | null;
  const url = typeof body?.url === 'string' && body.url.startsWith('http') ? body.url : '';
  if (!url) return NextResponse.json({ error: 'Falta la imagen.' }, { status: 400 });

  const g = await readJson<Galeria>('creaciones', VACIO);
  const creacion: Creacion = { id: crypto.randomUUID(), url, ts: Date.now() };
  g.items = [creacion, ...(g.items ?? [])].slice(0, 200);

  const { ok, error } = await writeJson('creaciones', g);
  if (!ok) return NextResponse.json({ error: error ?? 'No se pudo guardar.' }, { status: 500 });
  return NextResponse.json(creacion);
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Falta el identificador.' }, { status: 400 });

  const g = await readJson<Galeria>('creaciones', VACIO);
  g.items = (g.items ?? []).filter((c) => c.id !== id);
  const { ok, error } = await writeJson('creaciones', g);
  if (!ok) return NextResponse.json({ error: error ?? 'No se pudo borrar.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
