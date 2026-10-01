import { NextResponse } from 'next/server';

import { createTask } from '@/lib/ia/kie';

export const runtime = 'nodejs';

/**
 * Mejora de calidad (upscale) con Topaz. Devuelve un taskId que se consulta con
 * /api/status (igual que una generación). El resultado queda guardado en
 * results/ y aparece en "Mis creaciones".
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { url?: string; factor?: string } | null;
  const url = typeof body?.url === 'string' && body.url.startsWith('http') ? body.url : '';
  if (!url) return NextResponse.json({ error: 'Falta la imagen a mejorar.' }, { status: 400 });
  const factor = body?.factor === '4' ? '4' : '2';

  const result = await createTask('topaz/image-upscale', { image_url: url, upscale_factor: factor });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json({ taskId: result.taskId });
}
