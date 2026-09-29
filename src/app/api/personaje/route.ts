import { NextResponse } from 'next/server';

import { readJson, writeJson } from '@/lib/storage';

export const runtime = 'nodejs';

export type Personaje = { nombre: string; refs: string[] };

const VACIO: Personaje = { nombre: '', refs: [] };

export async function GET() {
  const p = await readJson<Personaje>('personaje', VACIO);
  return NextResponse.json(p);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Partial<Personaje> | null;

  const nombre = typeof body?.nombre === 'string' ? body.nombre.trim().slice(0, 60) : '';
  const refs = Array.isArray(body?.refs)
    ? body!.refs.filter((u): u is string => typeof u === 'string' && u.startsWith('http')).slice(0, 3)
    : [];

  const p: Personaje = { nombre, refs };
  const { ok, error } = await writeJson('personaje', p);
  if (!ok) return NextResponse.json({ error: error ?? 'No se pudo guardar el personaje.' }, { status: 500 });
  return NextResponse.json(p);
}
