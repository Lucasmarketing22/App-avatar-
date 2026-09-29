import { NextResponse } from 'next/server';

import { readJson, writeJson } from '@/lib/storage';

export const runtime = 'nodejs';

export type Vestido = { id: string; url: string; nombre: string };
type Catalogo = { items: Vestido[] };

const VACIO: Catalogo = { items: [] };

export async function GET() {
  const c = await readJson<Catalogo>('vestidos', VACIO);
  return NextResponse.json(c);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { url?: string; nombre?: string }
    | null;

  const url = typeof body?.url === 'string' && body.url.startsWith('http') ? body.url : '';
  if (!url) return NextResponse.json({ error: 'Falta la foto del vestido.' }, { status: 400 });
  const nombre = typeof body?.nombre === 'string' ? body.nombre.trim().slice(0, 60) : '';

  const c = await readJson<Catalogo>('vestidos', VACIO);
  const vestido: Vestido = { id: crypto.randomUUID(), url, nombre };
  c.items = [vestido, ...(c.items ?? [])].slice(0, 300);

  const { ok, error } = await writeJson('vestidos', c);
  if (!ok) return NextResponse.json({ error: error ?? 'No se pudo guardar el vestido.' }, { status: 500 });
  return NextResponse.json(vestido);
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Falta el identificador.' }, { status: 400 });

  const c = await readJson<Catalogo>('vestidos', VACIO);
  c.items = (c.items ?? []).filter((v) => v.id !== id);
  const { ok, error } = await writeJson('vestidos', c);
  if (!ok) return NextResponse.json({ error: error ?? 'No se pudo borrar.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
