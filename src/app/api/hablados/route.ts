import { NextResponse } from 'next/server';

import { guardarConfig, leerConfig } from '@/lib/hablados';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Idioma predeterminado + muestras de voz de cada modelo. */
export async function GET() {
  const c = await leerConfig();
  const voces: Record<string, { url: string; dur: number }> = {};
  for (const [id, m] of Object.entries(c.modelos ?? {})) if (m.voz?.url) voces[id] = m.voz;
  return NextResponse.json({ idioma: c.idioma ?? '', voces });
}

/** Guarda el idioma predeterminado. */
export async function PUT(request: Request) {
  const b = (await request.json().catch(() => null)) as { idioma?: string } | null;
  const idioma = typeof b?.idioma === 'string' ? b.idioma.trim().slice(0, 300) : '';
  const c = await leerConfig();
  const { ok, error } = await guardarConfig({ ...c, idioma });
  if (!ok) return NextResponse.json({ error: error ?? 'No se pudo guardar.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
