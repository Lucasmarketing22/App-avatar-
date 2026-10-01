import { NextResponse } from 'next/server';

import { GALERIA_KEYS } from '@/lib/estudio/galerias';
import { readJson, writeJson } from '@/lib/storage';

export const runtime = 'nodejs';

export type Item = { id: string; url: string };
type Catalogo = { items: Item[] };
const VACIO: Catalogo = { items: [] };

function tipoValido(t: string | null): t is string {
  return !!t && GALERIA_KEYS.includes(t);
}

export async function GET(request: Request) {
  const tipo = new URL(request.url).searchParams.get('tipo');
  if (!tipoValido(tipo)) return NextResponse.json({ error: 'Tipo inválido.' }, { status: 400 });
  const c = await readJson<Catalogo>(`galeria_${tipo}`, VACIO);
  return NextResponse.json(c);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { tipo?: string; url?: string } | null;
  const tipo = body?.tipo ?? null;
  if (!tipoValido(tipo)) return NextResponse.json({ error: 'Tipo inválido.' }, { status: 400 });
  const url = typeof body?.url === 'string' && body.url.startsWith('http') ? body.url : '';
  if (!url) return NextResponse.json({ error: 'Falta la foto.' }, { status: 400 });

  const c = await readJson<Catalogo>(`galeria_${tipo}`, VACIO);
  const item: Item = { id: crypto.randomUUID(), url };
  c.items = [item, ...(c.items ?? [])].slice(0, 300);
  const { ok, error } = await writeJson(`galeria_${tipo}`, c);
  if (!ok) return NextResponse.json({ error: error ?? 'No se pudo guardar.' }, { status: 500 });
  return NextResponse.json(item);
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const tipo = url.searchParams.get('tipo');
  const id = url.searchParams.get('id');
  if (!tipoValido(tipo)) return NextResponse.json({ error: 'Tipo inválido.' }, { status: 400 });
  if (!id) return NextResponse.json({ error: 'Falta el identificador.' }, { status: 400 });

  const c = await readJson<Catalogo>(`galeria_${tipo}`, VACIO);
  c.items = (c.items ?? []).filter((i) => i.id !== id);
  const { ok, error } = await writeJson(`galeria_${tipo}`, c);
  if (!ok) return NextResponse.json({ error: error ?? 'No se pudo borrar.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
