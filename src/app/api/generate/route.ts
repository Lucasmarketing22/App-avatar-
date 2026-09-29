import { NextResponse } from 'next/server';

import { createTask } from '@/lib/ia/kie';
import { KIE_EDIT_MODEL, KIE_TEXT_MODEL } from '@/lib/ia/models';

export const runtime = 'nodejs';

const ASPECTS = new Set(['1:1', '3:4', '4:3', '9:16', '16:9', '4:5']);

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { prompt?: string; imageUrl?: string | null; imageUrls?: string[]; aspect?: string }
    | null;

  const prompt = (body?.prompt ?? '').trim();
  // Aceptamos una sola foto (imageUrl) o varias (imageUrls: cara + vestido).
  const fromArray = Array.isArray(body?.imageUrls)
    ? body!.imageUrls.filter((u): u is string => typeof u === 'string' && u.startsWith('http'))
    : [];
  const imageUrls = fromArray.length
    ? fromArray.slice(0, 5)
    : body?.imageUrl && body.imageUrl.startsWith('http')
      ? [body.imageUrl]
      : [];
  const aspect = ASPECTS.has(body?.aspect ?? '') ? (body!.aspect as string) : '3:4';

  if (!prompt) {
    return NextResponse.json({ error: 'Escribí una frase para generar.' }, { status: 400 });
  }

  // Con imágenes de referencia usamos el modelo de edición; si no, texto→imagen.
  const model = imageUrls.length ? KIE_EDIT_MODEL : KIE_TEXT_MODEL;
  const input: Record<string, unknown> = {
    prompt,
    output_format: 'png',
    aspect_ratio: aspect,
  };
  if (imageUrls.length) input.image_urls = imageUrls;

  const result = await createTask(model, input);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({ taskId: result.taskId });
}
