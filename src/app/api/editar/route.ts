import { NextResponse } from 'next/server';

import { avanzarEdicion, CREDITOS_TRANSCRIBIR, empezarEdicion, leerEdicion, renderEdicion, type Edicion } from '@/lib/edicion/editar';
import { factorCuenta, TEXTO_ESTIMADO } from '@/lib/saldo';

export const runtime = 'nodejs';
// Armar el video (subtítulos + cortes + 1080) tarda ≈ 1 minuto; 5 es el máximo de Vercel.
export const maxDuration = 300;

const respuesta = (e: Edicion) => NextResponse.json({ id: e.id, estado: e.estado, resultado: e.resultado, error: e.error });

/**
 * Edición automática (ver lib/edicion/editar.ts).
 * GET (sin id) → cuánto cuesta, aproximado, en créditos de la cuenta.
 * GET ?id=… → en qué va.
 * POST { url, opciones } → empieza (transcribe). POST { id, accion: 'armar' } → arma el video.
 */
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ costo: (CREDITOS_TRANSCRIBIR + TEXTO_ESTIMADO) * (await factorCuenta()) });
  const e = await leerEdicion(id);
  if (!e) return NextResponse.json({ error: 'No se encontró esta edición.' }, { status: 404 });
  return respuesta(await avanzarEdicion(e));
}

export async function POST(request: Request) {
  const b = (await request.json().catch(() => null)) as { url?: string; id?: string; accion?: string; opciones?: unknown } | null;
  if (b?.accion === 'armar' && typeof b.id === 'string') {
    const e = await leerEdicion(b.id);
    if (!e) return NextResponse.json({ error: 'No se encontró esta edición.' }, { status: 404 });
    return respuesta(await renderEdicion(e));
  }
  if (typeof b?.url !== 'string') return NextResponse.json({ error: 'Falta el video.' }, { status: 400 });
  const r = await empezarEdicion(b.url, b.opciones);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ id: r.id, estado: 'escuchando' });
}
