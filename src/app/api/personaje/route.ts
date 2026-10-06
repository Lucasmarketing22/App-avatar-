import { NextResponse } from 'next/server';

import { readJson, writeJson } from '@/lib/storage';

export const runtime = 'nodejs';

/** Una modelo (personaje): su nombre y 1 a 3 fotos de la cara. */
export type Personaje = { id: string; nombre: string; refs: string[] };
/** Todas las modelos + cuál está elegida para crear. */
export type Modelos = { activo: string; lista: Personaje[] };

const MAX_MODELOS = 12;

function limpiar(p: unknown): Personaje | null {
  if (!p || typeof p !== 'object') return null;
  const o = p as Partial<Personaje>;
  const id = typeof o.id === 'string' ? o.id.trim().slice(0, 40) : '';
  if (!id) return null;
  const nombre = typeof o.nombre === 'string' ? o.nombre.trim().slice(0, 60) : '';
  const refs = Array.isArray(o.refs)
    ? o.refs.filter((u): u is string => typeof u === 'string' && u.startsWith('http')).slice(0, 3)
    : [];
  return { id, nombre, refs };
}

export async function GET() {
  const m = await readJson<Modelos>('personajes', { activo: '', lista: [] });
  if (Array.isArray(m.lista) && m.lista.length) return NextResponse.json(m);

  // Primera vez: pasamos la modelo que ya existía (un solo personaje) a la lista.
  const viejo = await readJson<{ nombre?: string; refs?: string[] }>('personaje', {});
  const p1 = limpiar({ id: 'p1', nombre: viejo.nombre ?? '', refs: viejo.refs ?? [] })!;
  return NextResponse.json({ activo: p1.id, lista: [p1] } satisfies Modelos);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Partial<Modelos> | null;
  const lista = (Array.isArray(body?.lista) ? body!.lista : [])
    .map(limpiar)
    .filter((p): p is Personaje => !!p)
    .slice(0, MAX_MODELOS);
  if (!lista.length) return NextResponse.json({ error: 'Tiene que quedar al menos una modelo.' }, { status: 400 });
  const activo = lista.some((p) => p.id === body?.activo) ? (body!.activo as string) : lista[0].id;

  const m: Modelos = { activo, lista };
  const { ok, error } = await writeJson('personajes', m);
  if (!ok) return NextResponse.json({ error: error ?? 'No se pudo guardar.' }, { status: 500 });
  return NextResponse.json(m);
}
