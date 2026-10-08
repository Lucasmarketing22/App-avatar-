import { NextResponse } from 'next/server';

import { createTask } from '@/lib/ia/kie';

export const runtime = 'nodejs';

/**
 * Motion control, dos modos (como las plataformas de motion control):
 *  - 'mover' (Kling 3.0 Motion Control): la modelo de la FOTO hace los mismos
 *    movimientos que la persona del VIDEO.
 *    orientacion 'video' = sigue el encuadre del video (hasta 30 s);
 *    'image' = respeta el encuadre de la foto (hasta 10 s).
 *  - 'reemplazar' (Wan 2.2 Animate Replace): deja el video original (lugar,
 *    cámara, luz) y cambia a la persona por la modelo de la foto.
 * Devuelve taskId; se consulta con /api/status (el video se guarda en videos/).
 */
const PROMPT_MOVER =
  'The woman from the reference image performs exactly the same movements, gestures, timing and facial expressions as the person in the reference video. ' +
  'Keep her face, identity, hairstyle, body shape and outfit exactly as in the reference image. ' +
  'Realistic, natural and fluid human motion, correct anatomy and hands, real skin texture, stable face without flicker or distortion.';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { modo?: string; imageUrl?: string; videoUrl?: string; prompt?: string; orientacion?: string; calidad?: string }
    | null;

  const imageUrl = typeof body?.imageUrl === 'string' && body.imageUrl.startsWith('http') ? body.imageUrl : '';
  const videoUrl = typeof body?.videoUrl === 'string' && body.videoUrl.startsWith('http') ? body.videoUrl : '';
  if (!imageUrl) return NextResponse.json({ error: 'Elegí la foto de tu modelo.' }, { status: 400 });
  if (!videoUrl) return NextResponse.json({ error: 'Subí el video de referencia.' }, { status: 400 });

  const aviso = `${new URL(request.url).origin}/api/kie-callback`;

  if (body?.modo === 'reemplazar') {
    const result = await createTask(
      'wan/2-2-animate-replace',
      {
        video_url: videoUrl,
        image_url: imageUrl,
        resolution: body?.calidad === '480p' ? '480p' : '720p',
        nsfw_checker: false,
      },
      aviso,
    );
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
    return NextResponse.json({ taskId: result.taskId });
  }

  const extra = (body?.prompt ?? '').trim();
  const result = await createTask(
    'kling-3.0/motion-control',
    {
      prompt: (extra ? `${PROMPT_MOVER} ${extra}` : PROMPT_MOVER).slice(0, 2500),
      input_urls: [imageUrl],
      video_urls: [videoUrl],
      character_orientation: body?.orientacion === 'image' ? 'image' : 'video',
      mode: body?.calidad === '1080p' ? '1080p' : '720p',
    },
    aviso,
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json({ taskId: result.taskId });
}
