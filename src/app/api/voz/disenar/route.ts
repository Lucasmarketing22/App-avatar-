import { NextResponse } from 'next/server';

import { FISH_API, errorFish, fishKey } from '@/lib/fish';
import { uploadPublic } from '@/lib/storage';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Frase que dice cada opción de voz (máx. 150 caracteres). */
const FRASE = 'Hola, ¿cómo estás? Qué lindo que estés acá. Te estaba esperando, vení que te cuento algo.';

type Candidato = { audio_base64?: string; text?: string; signature?: string; voice_design_signature?: string };

/** Crea 3 opciones de voz a partir de una descripción (Fish Audio Voice Design). */
export async function POST(request: Request) {
  const key = fishKey();
  if (!key) return NextResponse.json({ error: 'Falta la clave de Fish Audio (FISH_AUDIO_API_KEY). Cargala en Vercel.' }, { status: 400 });
  const body = (await request.json().catch(() => null)) as { instruccion?: string } | null;
  const instruccion = typeof body?.instruccion === 'string' ? body.instruccion.trim().slice(0, 2000) : '';
  if (instruccion.length < 5) return NextResponse.json({ error: 'Describí un poco más cómo querés que sea la voz.' }, { status: 400 });

  let res: Response;
  try {
    res = await fetch(`${FISH_API}/v1/voice-design`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', model: 'voice-design-1' },
      cache: 'no-store',
      body: JSON.stringify({ instruction: instruccion, reference_text: FRASE, language: 'es', n: 3 }),
    });
  } catch {
    return NextResponse.json({ error: 'No se pudo conectar con Fish Audio. Probá de nuevo.' }, { status: 502 });
  }
  if (!res.ok) return NextResponse.json({ error: errorFish(res.status, await res.text().catch(() => '')) }, { status: 502 });

  const data = (await res.json().catch(() => ({}))) as { candidates?: Candidato[] };
  const ts = Date.now();
  const opciones = (await Promise.all((data.candidates ?? []).map(async (c, i) => {
    if (!c.audio_base64) return null;
    const bytes = Uint8Array.from(Buffer.from(c.audio_base64, 'base64'));
    const esWav = bytes[0] === 0x52 && bytes[1] === 0x49; // "RI"FF
    const up = await uploadPublic(`vozdiseno/${ts}-${i}.${esWav ? 'wav' : 'mp3'}`, bytes, esWav ? 'audio/wav' : 'audio/mpeg');
    if (!up.url) return null;
    return { url: up.url, texto: c.text || FRASE, firma: c.signature ?? c.voice_design_signature ?? null };
  }))).filter(Boolean);

  if (!opciones.length) return NextResponse.json({ error: 'Fish Audio no devolvió voces. Probá con otra descripción.' }, { status: 502 });
  return NextResponse.json({ opciones });
}
