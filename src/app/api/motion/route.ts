import { NextResponse } from 'next/server';

import { createTask } from '@/lib/ia/kie';

export const runtime = 'nodejs';

/**
 * Motion control (Kling 2.6, vía Kie): la modelo de la FOTO hace los mismos
 * movimientos que la persona del VIDEO de referencia. Devuelve taskId; se
 * consulta con /api/status (el resultado es un video y se guarda en videos/).
 *  - orientacion 'video': sigue el encuadre del video (hasta 30 s).
 *  - orientacion 'image': respeta el encuadre de la foto (hasta 10 s).
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { imageUrl?: string; videoUrl?: string; prompt?: string; orientacion?: string; calidad?: string }
    | null;

  const imageUrl = typeof body?.imageUrl === 'string' && body.imageUrl.startsWith('http') ? body.imageUrl : '';
  const videoUrl = typeof body?.videoUrl === 'string' && body.videoUrl.startsWith('http') ? body.videoUrl : '';
  if (!imageUrl) return NextResponse.json({ error: 'Elegí la foto de tu modelo.' }, { status: 400 });
  if (!videoUrl) return NextResponse.json({ error: 'Subí el video de referencia.' }, { status: 400 });

  const input: Record<string, unknown> = {
    input_urls: [imageUrl],
    video_urls: [videoUrl],
    character_orientation: body?.orientacion === 'image' ? 'image' : 'video',
    mode: body?.calidad === '1080p' ? '1080p' : '720p',
  };
  const prompt = (body?.prompt ?? '').trim().slice(0, 2500);
  if (prompt) input.prompt = prompt;

  const result = await createTask('kling-2.6/motion-control', input);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json({ taskId: result.taskId });
}
