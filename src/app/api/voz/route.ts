import { NextResponse } from 'next/server';

import { uploadPublic, listPublic, removeObject, readJson, writeJson } from '@/lib/storage';

export const runtime = 'nodejs';

/** Identidad de voz guardada del personaje (modelo de voz de Fish Audio). */
type VozCfg = { reference_id?: string; nombre?: string };

function fishKey(): string {
  // Acepta el nombre estándar y también "fishapi" (como lo cargó el usuario).
  return process.env.FISH_AUDIO_API_KEY || process.env.fishapi || process.env.FISHAPI || '';
}

/** Estado + voz guardada + audios generados. */
export async function GET() {
  const [voz, blobs] = await Promise.all([
    readJson<VozCfg>('voz', {}),
    listPublic('voces/'),
  ]);
  const items = blobs
    .sort((a, b) => b.uploadedAt - a.uploadedAt)
    .map((b) => ({ id: b.pathname, url: b.url, ts: b.uploadedAt }));
  return NextResponse.json({ configured: !!fishKey(), voz, items });
}

/** Guarda la identidad de voz (reference_id + nombre). */
export async function PUT(request: Request) {
  const body = (await request.json().catch(() => null)) as VozCfg | null;
  const reference_id = typeof body?.reference_id === 'string' ? body.reference_id.trim().slice(0, 200) : '';
  const nombre = typeof body?.nombre === 'string' ? body.nombre.trim().slice(0, 80) : '';
  const { ok, error } = await writeJson('voz', { reference_id, nombre });
  if (!ok) return NextResponse.json({ error: error ?? 'No se pudo guardar.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** Genera audio a partir de texto con la voz del personaje. */
export async function POST(request: Request) {
  const key = fishKey();
  if (!key) {
    return NextResponse.json({ error: 'Falta la clave de Fish Audio (FISH_AUDIO_API_KEY). Cargala en Vercel.' }, { status: 400 });
  }
  const body = (await request.json().catch(() => null)) as { text?: string } | null;
  const text = typeof body?.text === 'string' ? body.text.trim().slice(0, 4000) : '';
  if (!text) return NextResponse.json({ error: 'Escribí el texto que querés que diga.' }, { status: 400 });

  const voz = await readJson<VozCfg>('voz', {});
  const payload: Record<string, unknown> = { text, format: 'mp3', mp3_bitrate: 128 };
  if (voz.reference_id) payload.reference_id = voz.reference_id;

  let res: Response;
  try {
    res = await fetch('https://api.fish.audio/v1/tts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', model: 's2.1-pro' },
      cache: 'no-store',
      body: JSON.stringify(payload),
    });
  } catch {
    return NextResponse.json({ error: 'No se pudo conectar con Fish Audio. Probá de nuevo.' }, { status: 502 });
  }

  if (!res.ok) {
    const detalle = await res.text().catch(() => '');
    if (res.status === 401) return NextResponse.json({ error: 'La clave de Fish Audio no es válida.' }, { status: 502 });
    if (res.status === 402 || res.status === 403) return NextResponse.json({ error: 'Te quedaste sin crédito en Fish Audio (o el plan no lo permite).' }, { status: 502 });
    if (res.status === 422) return NextResponse.json({ error: 'El ID de voz no es válido o el texto tiene un problema. Revisá la identidad de voz.' }, { status: 502 });
    return NextResponse.json({ error: `Fish Audio devolvió un error (${res.status}). ${detalle.slice(0, 160)}` }, { status: 502 });
  }

  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!bytes.length) return NextResponse.json({ error: 'Fish Audio no devolvió audio.' }, { status: 502 });

  const path = `voces/${Date.now()}.mp3`;
  const up = await uploadPublic(path, bytes, 'audio/mpeg');
  if (!up.url) return NextResponse.json({ error: up.error ?? 'No se pudo guardar el audio.' }, { status: 500 });
  return NextResponse.json({ url: up.url });
}

/** Borra un audio por su URL. */
export async function DELETE(request: Request) {
  const url = new URL(request.url).searchParams.get('url');
  if (!url) return NextResponse.json({ error: 'Falta el audio.' }, { status: 400 });
  await removeObject(url);
  return NextResponse.json({ ok: true });
}
