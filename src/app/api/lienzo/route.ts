import { NextResponse } from 'next/server';

import { readJson, writeJson } from '@/lib/storage';

export const runtime = 'nodejs';

/**
 * Varios lienzos con nombre. Cada uno (cajas, cables y vista) se guarda entero
 * como JSON: el primero ("principal") en config/lienzo.json (como antes) y los
 * demás en config/lienzo-<id>.json. La lista y el elegido, en config/lienzos.json.
 */
type Lienzo = { nodes: unknown[]; edges: unknown[]; view?: unknown };
type Item = { id: string; nombre: string };
type Lista = { activo: string; lista: Item[] };

const PRINCIPAL = 'principal';
const VACIO: Lienzo = { nodes: [], edges: [] };
const idValido = (id: unknown): id is string => typeof id === 'string' && /^[a-z0-9-]{1,40}$/.test(id);
const archivo = (id: string) => (id === PRINCIPAL ? 'lienzo' : `lienzo-${id}`);

async function leerLista(): Promise<Lista> {
  const l = await readJson<Lista>('lienzos', { activo: PRINCIPAL, lista: [] });
  const lista = Array.isArray(l.lista) ? l.lista.filter((x) => idValido(x?.id)) : [];
  if (!lista.length) lista.push({ id: PRINCIPAL, nombre: 'Mi lienzo' });
  const activo = lista.some((x) => x.id === l.activo) ? l.activo : lista[0].id;
  return { activo, lista };
}

/** GET ?id= → la lista + el lienzo pedido (o el elegido). */
export async function GET(request: Request) {
  const pedido = new URL(request.url).searchParams.get('id');
  const lista = await leerLista();
  const id = idValido(pedido) && lista.lista.some((x) => x.id === pedido) ? pedido : lista.activo;
  const lienzo = await readJson<Lienzo>(archivo(id), VACIO);
  return NextResponse.json({ ...lista, id, ...lienzo });
}

/** POST { id, nodes, edges, view } → guarda ese lienzo. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as (Lienzo & { id?: string }) | null;
  if (!body || !Array.isArray(body.nodes) || !Array.isArray(body.edges)) {
    return NextResponse.json({ error: 'Lienzo inválido.' }, { status: 400 });
  }
  const id = idValido(body.id) ? body.id : PRINCIPAL;
  if (JSON.stringify(body).length > 400_000) return NextResponse.json({ error: 'El lienzo es demasiado grande.' }, { status: 413 });
  const { ok, error } = await writeJson(archivo(id), { nodes: body.nodes.slice(0, 120), edges: body.edges.slice(0, 300), view: body.view });
  if (!ok) return NextResponse.json({ error: error ?? 'No se pudo guardar.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** PUT { activo, lista } → guarda la lista de lienzos (nombres, orden, cuál está elegido). */
export async function PUT(request: Request) {
  const body = (await request.json().catch(() => null)) as Partial<Lista> | null;
  const lista = (Array.isArray(body?.lista) ? body!.lista : [])
    .filter((x) => idValido(x?.id))
    .map((x) => ({ id: x.id, nombre: (typeof x.nombre === 'string' && x.nombre.trim() ? x.nombre.trim() : 'Lienzo').slice(0, 40) }))
    .slice(0, 30);
  if (!lista.length) return NextResponse.json({ error: 'Tiene que quedar al menos un lienzo.' }, { status: 400 });
  const activo = lista.some((x) => x.id === body?.activo) ? (body!.activo as string) : lista[0].id;
  const { ok, error } = await writeJson('lienzos', { activo, lista });
  if (!ok) return NextResponse.json({ error: error ?? 'No se pudo guardar.' }, { status: 500 });
  return NextResponse.json({ activo, lista });
}
