import { NextResponse } from 'next/server';

import { readJson } from '@/lib/storage';
import { leerTarea, taskIdDeUrl } from '@/lib/tareas';

export const runtime = 'nodejs';

/** Datos viejos (antes de las fichas por tarea): config/meta.json, por URL. */
export type Meta = Record<string, { prompt: string; modelo?: string; refs?: string[]; aspect?: string; credits?: number; ts: number }>;

/**
 * GET ?url= → con qué prompt, modelo, referencias y formato se creó una foto.
 * Sale de su ficha (tareas/<taskId>.json); si es vieja, de config/meta.json.
 * (Lo guarda el servidor al crearla: así no se pisan cuando salen varias juntas.)
 */
export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get('url') ?? '';
  if (!url.startsWith('http')) return NextResponse.json({ error: 'Falta la foto.' }, { status: 400 });
  const t = await leerTarea(taskIdDeUrl(url));
  if (t?.prompt) return NextResponse.json({ prompt: t.prompt, modelo: t.modelo, refs: t.refs, aspect: t.aspect, credits: t.credits });
  const viejo = (await readJson<Meta>('meta', {}))[url];
  return NextResponse.json(viejo ?? {});
}
