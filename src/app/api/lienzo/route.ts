import { NextResponse } from 'next/server';

import { readJson, writeJson } from '@/lib/storage';

export const runtime = 'nodejs';

/** El lienzo (cajas, cables y vista) se guarda entero como JSON. */
type Lienzo = { nodes: unknown[]; edges: unknown[]; view?: unknown };

export async function GET() {
  const l = await readJson<Lienzo>('lienzo', { nodes: [], edges: [] });
  return NextResponse.json(l);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Lienzo | null;
  if (!body || !Array.isArray(body.nodes) || !Array.isArray(body.edges)) {
    return NextResponse.json({ error: 'Lienzo inválido.' }, { status: 400 });
  }
  const texto = JSON.stringify(body);
  if (texto.length > 400_000) return NextResponse.json({ error: 'El lienzo es demasiado grande.' }, { status: 413 });
  const { ok, error } = await writeJson('lienzo', { nodes: body.nodes.slice(0, 120), edges: body.edges.slice(0, 300), view: body.view });
  if (!ok) return NextResponse.json({ error: error ?? 'No se pudo guardar.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
