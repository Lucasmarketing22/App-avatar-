import { NextResponse } from 'next/server';

import { describirCuerpo, medidasDe } from '@/lib/estudio/prompt';
import { pedirTarea } from '@/lib/tareas';

export const runtime = 'nodejs';

/**
 * Motion control, dos modos (como las plataformas de motion control):
 *  - 'mover' (Kling 3.0 Motion Control, o Kling 2.6 con motor 'kling26': más
 *    barato, hasta 10 s): la modelo de la FOTO hace los mismos movimientos que
 *    la persona del VIDEO.
 *    orientacion 'video' = sigue el encuadre del video (hasta 30 s);
 *    'image' = respeta el encuadre de la foto (hasta 10 s).
 *  - 'reemplazar' (Wan 2.2 Animate Replace): deja el video original (lugar,
 *    cámara, luz) y cambia a la persona por la modelo de la foto.
 * Devuelve taskId; se consulta con /api/status (el video se guarda en videos/).
 */
const PROMPT_MOVER =
  'The woman from the reference image performs exactly the same movements, gestures, timing and facial expressions as the person in the reference video. ' +
  'Keep her face, identity, hairstyle, body shape and outfit exactly as in the reference image. ' +
  'IDENTITY LOCK: her face must come ONLY from the reference image and stay identical in every frame (same face shape and width, eyes, nose, lips, freckles, hair color). ' +
  'From the reference video copy ONLY the motion, gestures and expressions — never the face, hair, skin or body of the person in the video. ' +
  'Keep the background, location and lighting of the reference image. ' +
  'Realistic, natural and fluid human motion, correct anatomy and hands, real skin texture, stable face without flicker or distortion. ' +
  'It must look like real, unedited smartphone video footage, not AI: natural skin with pores, no smoothing, no plastic or waxy look.';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { modo?: string; motor?: string; imageUrl?: string; videoUrl?: string; prompt?: string; orientacion?: string; calidad?: string; cuerpo?: string; fijo?: string; audioOriginal?: string; dur?: number }
    | null;

  const imageUrl = typeof body?.imageUrl === 'string' && body.imageUrl.startsWith('http') ? body.imageUrl : '';
  const videoUrl = typeof body?.videoUrl === 'string' && body.videoUrl.startsWith('http') ? body.videoUrl : '';
  if (!imageUrl) return NextResponse.json({ error: 'Elegí la foto de tu modelo.' }, { status: 400 });
  if (!videoUrl) return NextResponse.json({ error: 'Subí el video de referencia.' }, { status: 400 });

  // Video subido CON sonido: al terminar, el servidor le pega ese audio al video final.
  const audio = typeof body?.audioOriginal === 'string' ? body.audioOriginal : undefined;
  const dur = Number(body?.dur) || undefined;

  if (body?.modo === 'reemplazar') {
    const result = await pedirTarea(
      request,
      'wan/2-2-animate-replace',
      {
        video_url: videoUrl,
        image_url: imageUrl,
        resolution: body?.calidad === '480p' ? '480p' : '720p',
        nsfw_checker: false,
      },
      { tipo: 'video', audio, dur },
    );
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ taskId: result.taskId });
  }

  const cuerpo = medidasDe(body?.cuerpo, body?.fijo).slice(0, 200);
  const extra = [
    cuerpo ? `Her body must keep exactly these proportions the whole time (${describirCuerpo(cuerpo)}); never slimmer, flatter or with a wider waist. Her face stays exactly as in the reference image.` : '',
    (body?.fijo ?? '').trim() ? `Fixed traits (always): ${(body?.fijo ?? '').trim().slice(0, 800)}.` : '',
    (body?.prompt ?? '').trim(),
  ].filter(Boolean).join(' ');
  const result = await pedirTarea(
    request,
    body?.motor === 'kling26' ? 'kling-2.6/motion-control' : 'kling-3.0/motion-control',
    {
      prompt: (extra ? `${PROMPT_MOVER} ${extra}` : PROMPT_MOVER).slice(0, 2500),
      input_urls: [imageUrl],
      video_urls: [videoUrl],
      character_orientation: body?.orientacion === 'image' ? 'image' : 'video',
      mode: body?.calidad === '1080p' ? '1080p' : '720p',
    },
    { tipo: 'video', prompt: (body?.prompt ?? '').trim() || undefined, audio, dur },
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ taskId: result.taskId });
}
