import { NextResponse } from 'next/server';

import { IDIOMAS, type Marca } from '@/lib/estudio/anuncios';
import { readJson, writeJson } from '@/lib/storage';

export const runtime = 'nodejs';

/** Fichas de las marcas (Clientes): config/marcas.json de cada cuenta. */
type Catalogo = { items: Marca[] };
const VACIO: Catalogo = { items: [] };

const txt = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const esUrl = (u: unknown): u is string => typeof u === 'string' && u.startsWith('https://');

export async function GET() {
  const c = await readJson<Catalogo>('marcas', VACIO);
  return NextResponse.json({ items: c.items ?? [] });
}

/** Crea o actualiza una marca (si trae id, la reemplaza). */
export async function POST(request: Request) {
  const b = (await request.json().catch(() => null)) as Partial<Marca> | null;
  const nombre = txt(b?.nombre, 60);
  if (!nombre) return NextResponse.json({ error: 'Poné el nombre de la marca.' }, { status: 400 });
  const marca: Marca = {
    id: txt(b?.id, 40).replace(/[^a-zA-Z0-9-]/g, '') || crypto.randomUUID(),
    nombre,
    rubro: txt(b?.rubro, 120),
    logo: esUrl(b?.logo) ? b.logo : '',
    colores: (Array.isArray(b?.colores) ? b.colores : []).filter((c): c is string => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c)).slice(0, 4),
    tono: txt(b?.tono, 120),
    publico: txt(b?.publico, 200),
    idioma: IDIOMAS.some((i) => i.id === b?.idioma) ? b!.idioma! : 'neutro',
    productos: (Array.isArray(b?.productos) ? b.productos : [])
      .filter((p) => esUrl(p?.url))
      .map((p) => ({ url: p.url, nombre: txt(p.nombre, 60) }))
      .slice(0, 12),
    evitar: txt(b?.evitar, 300),
    ts: Date.now(),
  };
  const c = await readJson<Catalogo>('marcas', VACIO);
  c.items = [marca, ...(c.items ?? []).filter((m) => m.id !== marca.id)].slice(0, 100);
  const { ok, error } = await writeJson('marcas', c);
  if (!ok) return NextResponse.json({ error: error ?? 'No se pudo guardar la marca.' }, { status: 500 });
  return NextResponse.json(marca);
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Falta el identificador.' }, { status: 400 });
  const c = await readJson<Catalogo>('marcas', VACIO);
  c.items = (c.items ?? []).filter((m) => m.id !== id);
  const { ok, error } = await writeJson('marcas', c);
  if (!ok) return NextResponse.json({ error: error ?? 'No se pudo borrar.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
