import { NextResponse } from 'next/server';

import { FISH_API, errorFish, fishKey } from '@/lib/fish';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Guarda una de las opciones creadas por descripción como voz FIJA en Fish
 * Audio (modelo privado, modo rápido) y devuelve su ID para usarla siempre.
 */
export async function POST(request: Request) {
  const key = fishKey();
  if (!key) return NextResponse.json({ error: 'Falta la clave de Fish Audio (FISH_AUDIO_API_KEY). Cargala en Vercel.' }, { status: 400 });
  const body = (await request.json().catch(() => null)) as { audioUrl?: string; texto?: string; firma?: string | null; nombre?: string } | null;
  const audioUrl = typeof body?.audioUrl === 'string' ? body.audioUrl : '';
  let host = '';
  try { host = new URL(audioUrl).hostname; } catch { /* */ }
  if (!host.endsWith('.public.blob.vercel-storage.com')) return NextResponse.json({ error: 'Audio inválido.' }, { status: 400 });
  const nombre = (typeof body?.nombre === 'string' && body.nombre.trim() ? body.nombre.trim() : 'Voz de mi modelo').slice(0, 60);

  const audio = await fetch(audioUrl).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null);
  if (!audio) return NextResponse.json({ error: 'No se pudo leer el audio de esa opción. Creá las opciones de nuevo.' }, { status: 400 });

  const form = new FormData();
  form.append('type', 'tts');
  form.append('title', nombre);
  form.append('train_mode', 'fast');
  form.append('visibility', 'private');
  form.append('voices', new Blob([audio], { type: audioUrl.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg' }), audioUrl.endsWith('.wav') ? 'voz.wav' : 'voz.mp3');
  if (typeof body?.texto === 'string' && body.texto.trim()) form.append('texts', body.texto.trim().slice(0, 500));
  if (typeof body?.firma === 'string' && body.firma) form.append('voice_design_signatures', body.firma);

  let res: Response;
  try {
    res = await fetch(`${FISH_API}/model`, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form, cache: 'no-store' });
  } catch {
    return NextResponse.json({ error: 'No se pudo conectar con Fish Audio. Probá de nuevo.' }, { status: 502 });
  }
  if (!res.ok) return NextResponse.json({ error: errorFish(res.status, await res.text().catch(() => '')) }, { status: 502 });
  const m = (await res.json().catch(() => ({}))) as { _id?: string };
  if (!m._id) return NextResponse.json({ error: 'Fish Audio no devolvió la voz creada.' }, { status: 502 });
  return NextResponse.json({ id: m._id });
}
