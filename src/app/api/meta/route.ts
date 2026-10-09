import { NextResponse } from 'next/server';

import { readJson, writeJson } from '@/lib/storage';

export const runtime = 'nodejs';

export type Meta = Record<string, { prompt: string; modelo?: string; refs?: string[]; aspect?: string; credits?: number; ts: number }>;

/** Guarda el prompt, modelo, referencias y formato con el que se creó cada imagen (por URL). */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { url?: string; prompt?: string; modelo?: string; refs?: unknown; aspect?: string; credits?: unknown } | null;
  const url = typeof body?.url === 'string' && body.url.startsWith('http') ? body.url : '';
  const prompt = typeof body?.prompt === 'string' ? body.prompt.slice(0, 6000) : '';
  if (!url || !prompt) return NextResponse.json({ error: 'Faltan datos.' }, { status: 400 });

  const refs = Array.isArray(body?.refs)
    ? (body!.refs as unknown[]).filter((u): u is string => typeof u === 'string' && u.startsWith('http')).slice(0, 8)
    : undefined;
  const aspect = typeof body?.aspect === 'string' ? body.aspect : undefined;

  const meta = await readJson<Meta>('meta', {});
  const credits = typeof body?.credits === 'number' && Number.isFinite(body.credits) ? body.credits : undefined;
  meta[url] = { prompt, modelo: typeof body?.modelo === 'string' ? body.modelo : undefined, refs, aspect, credits, ts: Date.now() };
  // Mantenemos las 600 más nuevas para que no crezca sin fin.
  const pruned: Meta = {};
  for (const [k, v] of Object.entries(meta).sort((a, b) => b[1].ts - a[1].ts).slice(0, 600)) pruned[k] = v;

  const { ok, error } = await writeJson('meta', pruned);
  if (!ok) return NextResponse.json({ error: error ?? 'No se pudo guardar.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
