import { NextResponse } from 'next/server';

import { readJson, writeJson } from '@/lib/storage';

export const runtime = 'nodejs';

/** Una modelo (personaje): su nombre, 1 a 3 fotos de la cara y (opcional) fotos del cuerpo. */
/** Voz fija de la modelo (un modelo de voz de Fish Audio). */
export type VozModelo = { ref: string; nombre?: string; muestra?: string };
export type Personaje = { id: string; nombre: string; refs: string[]; cuerpo?: string; entero?: string; medio?: string; voz?: VozModelo };
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
  // Contextura / medidas (ej: "100-60-95, curvilínea"). Se suma a cada prompt.
  const cuerpo = typeof o.cuerpo === 'string' ? o.cuerpo.trim().slice(0, 200) : '';
  // Fotos del cuerpo (cuerpo entero / medio cuerpo): referencia de la figura.
  const url = (u: unknown) => (typeof u === 'string' && u.startsWith('http') ? u : '');
  const entero = url(o.entero);
  const medio = url(o.medio);
  const v = o.voz as Partial<VozModelo> | undefined;
  const voz: VozModelo | null = v && typeof v.ref === 'string' && /^[A-Za-z0-9_-]{6,80}$/.test(v.ref)
    ? { ref: v.ref, nombre: typeof v.nombre === 'string' ? v.nombre.trim().slice(0, 80) : '', muestra: url(v.muestra) }
    : null;
  return {
    id, nombre, refs,
    ...(cuerpo ? { cuerpo } : {}),
    ...(entero ? { entero } : {}),
    ...(medio ? { medio } : {}),
    ...(voz ? { voz } : {}),
  };
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
