import { NextResponse } from 'next/server';

import { createTask } from '@/lib/ia/kie';
import { buscarModelo } from '@/lib/ia/models';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { prompt?: string; imageUrl?: string | null; imageUrls?: string[]; aspect?: string; modelo?: string }
    | null;

  const prompt = (body?.prompt ?? '').trim();
  const fromArray = Array.isArray(body?.imageUrls)
    ? body!.imageUrls.filter((u): u is string => typeof u === 'string' && u.startsWith('http'))
    : [];
  const imageUrls = fromArray.length
    ? fromArray.slice(0, 8)
    : body?.imageUrl && body.imageUrl.startsWith('http')
      ? [body.imageUrl]
      : [];

  if (!prompt) {
    return NextResponse.json({ error: 'Escribí una frase para generar.' }, { status: 400 });
  }

  const modelo = buscarModelo(body?.modelo);
  // Relación de aspecto: si el modelo no la soporta, usamos 3:4.
  const pedido = body?.aspect ?? '3:4';
  const aspect = modelo.aspects.includes(pedido) ? pedido : '3:4';

  const input: Record<string, unknown> = { prompt, ...modelo.extra(aspect) };
  if (imageUrls.length) {
    // Algunos modelos (Qwen) reciben UNA sola imagen (string); el resto, un array.
    input[modelo.refsField] = modelo.refsSingle ? imageUrls[0] : imageUrls;
  }

  const result = await createTask(modelo.kieModel, input);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({ taskId: result.taskId });
}
