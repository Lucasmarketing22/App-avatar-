import { NextResponse } from 'next/server';

import { createTask } from '@/lib/ia/kie';

export const runtime = 'nodejs';

const ASPECTS = new Set(['16:9', '9:16', 'Auto']);

/**
 * Genera un video con Veo 3.1 (Kie). Imagen→video: animamos la foto de
 * referencia (REFERENCE_2_VIDEO, 1 imagen = el video se construye alrededor
 * de esa imagen). Devuelve taskId; se consulta con /api/status.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { prompt?: string; imageUrls?: string[]; aspect?: string; duration?: number }
    | null;

  const prompt = (body?.prompt ?? '').trim() || 'The same woman from the reference image moves naturally and subtly, a gentle lifelike motion, she looks toward the camera and gives a soft natural smile. Keep her face and identity identical. Realistic, cinematic, handheld feel.';
  const imageUrls = Array.isArray(body?.imageUrls)
    ? body!.imageUrls.filter((u): u is string => typeof u === 'string' && u.startsWith('http')).slice(0, 3)
    : [];
  if (!imageUrls.length) {
    return NextResponse.json({ error: 'Falta la imagen para animar.' }, { status: 400 });
  }
  const aspect = ASPECTS.has(body?.aspect ?? '') ? (body!.aspect as string) : '9:16';
  const duration = [4, 6, 8].includes(Number(body?.duration)) ? Number(body!.duration) : 8;

  const input: Record<string, unknown> = {
    prompt,
    image_urls: imageUrls,
    generation_type: 'REFERENCE_2_VIDEO',
    aspect_ratio: aspect,
    resolution: '720p',
    duration,
    enable_translation: false,
  };

  const result = await createTask('veo-3-1', input);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json({ taskId: result.taskId });
}
