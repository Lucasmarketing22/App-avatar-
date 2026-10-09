import { NextResponse } from 'next/server';

import { FISH_API, fishKey } from '@/lib/fish';

export const runtime = 'nodejs';

type FishModelo = {
  _id: string;
  title?: string;
  description?: string;
  tags?: string[];
  languages?: string[];
  task_count?: number;
  samples?: { audio?: string }[];
};

/** Biblioteca pública de voces de Fish Audio (buscar, idioma, mujer/hombre). */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const params = new URLSearchParams({
    page_size: '12',
    page_number: String(Math.max(1, Math.min(50, Number(q.get('pagina')) || 1))),
    sort_by: 'score',
  });
  const titulo = (q.get('q') ?? '').trim().slice(0, 60);
  if (titulo) params.set('title', titulo);
  const idioma = q.get('idioma') ?? '';
  if (/^[a-z]{2}$/.test(idioma)) params.set('language', idioma);
  const genero = q.get('genero') ?? '';
  if (genero === 'female' || genero === 'male') params.set('tag', genero);

  const key = fishKey();
  let res: Response;
  try {
    res = await fetch(`${FISH_API}/model?${params}`, {
      headers: key ? { Authorization: `Bearer ${key}` } : {},
      next: { revalidate: 600 },
    });
  } catch {
    return NextResponse.json({ error: 'No se pudo conectar con Fish Audio.' }, { status: 502 });
  }
  if (!res.ok) return NextResponse.json({ error: `Fish Audio no respondió (${res.status}).` }, { status: 502 });
  const data = (await res.json().catch(() => ({}))) as { items?: FishModelo[]; has_more?: boolean; total?: number };
  const items = (data.items ?? [])
    .map((m) => ({
      id: m._id,
      titulo: (m.title ?? 'Sin nombre').slice(0, 80),
      desc: (m.description ?? '').slice(0, 220),
      tags: (m.tags ?? []).slice(0, 6),
      usos: m.task_count ?? 0,
      muestra: m.samples?.find((s) => typeof s.audio === 'string' && s.audio.startsWith('http'))?.audio ?? '',
    }))
    .filter((m) => m.id && m.muestra);
  return NextResponse.json({ items, hayMas: data.has_more ?? (data.items?.length ?? 0) >= 12 });
}
