import { NextResponse } from 'next/server';

import { pedirTarea } from '@/lib/tareas';

export const runtime = 'nodejs';

/**
 * "Mila hablando": foto + audio → video con la boca sincronizada (vía Kie).
 *  - 'kling-std' / 'kling-pro': Kling AI Avatar (720p / 1080p).
 *  - 'inf-480' / 'inf-720': InfiniteTalk (audio de hasta 15 s).
 * Devuelve taskId; se consulta con /api/status (el video se guarda en videos/).
 */
const PROMPT =
  'The woman from the image talks naturally to the camera, perfectly lip-synced to the audio, with natural facial expressions, ' +
  'blinking and subtle head and shoulder movement. Keep her face, identity, hair, outfit and background exactly as in the image. ' +
  'Realistic skin texture, stable face, no distortion, looks like a real smartphone video.';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { imageUrl?: string; audioUrl?: string; motor?: string; prompt?: string } | null;
  const imageUrl = typeof body?.imageUrl === 'string' && body.imageUrl.startsWith('http') ? body.imageUrl : '';
  const audioUrl = typeof body?.audioUrl === 'string' && body.audioUrl.startsWith('http') ? body.audioUrl : '';
  if (!imageUrl) return NextResponse.json({ error: 'Falta la foto de tu modelo.' }, { status: 400 });
  if (!audioUrl) return NextResponse.json({ error: 'Falta el audio.' }, { status: 400 });
  const extra = (body?.prompt ?? '').trim().slice(0, 1500);
  const prompt = (extra ? `${PROMPT} ${extra}` : PROMPT).slice(0, 4900);
  const motor = body?.motor ?? 'kling-std';
  const datos = { tipo: 'video' as const, prompt: extra || undefined };

  const result = motor.startsWith('inf-')
    ? await pedirTarea(request, 'infinitalk/from-audio', { image_url: imageUrl, audio_url: audioUrl, prompt, resolution: motor === 'inf-720' ? '720p' : '480p', nsfw_checker: false }, datos)
    : await pedirTarea(request, motor === 'kling-pro' ? 'kling/ai-avatar-pro' : 'kling/ai-avatar-standard', { image_url: imageUrl, audio_url: audioUrl, prompt }, datos);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ taskId: result.taskId });
}
