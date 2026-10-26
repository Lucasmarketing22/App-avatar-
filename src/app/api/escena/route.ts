import { NextResponse } from 'next/server';

import { replicateListo } from '@/lib/ia/replicate';
import { pedirTarea, pedirTareaReplicate } from '@/lib/tareas';

export const runtime = 'nodejs';

const esUrl = (u: unknown): u is string => typeof u === 'string' && u.startsWith('https://');

/** Qué es cada foto de referencia (así la IA sabe quién es quién). */
const ROLES: Record<string, string> = {
  a: 'Person A (a character: keep their face, hair, body and outfit exactly)',
  b: 'Person B (a character: keep their face, hair, body and outfit exactly)',
  c: 'Person C (a character: keep their face, hair, body and outfit exactly)',
  lugar: 'the location (keep the room, furniture, light and colors)',
  ropa: 'an outfit to wear',
  objeto: 'an object or product that appears in the scene',
};

/**
 * Escena: video de hasta 30 s con varias personas que hablan entre sí, hecho
 * con Seedance 2.5 a partir de fotos de referencia (personas, lugar, objetos)
 * y una descripción con los diálogos. Sonido y voces se generan juntos.
 *  - calidad 'borrador': 480p barato para probar; después se puede pasar a
 *    1080p con la misma escena ({ accion: 'final', borrador: taskId }).
 *  - 720p se hace en Replicate (≈ 27 % más barato que en Kie, misma Seedance 2.5);
 *    si Replicate no lo acepta, en Kie. Si Kie no acepta un borrador, se hace en
 *    Replicate en 480p normal (ese no se puede pasar a 1080p).
 * Devuelve taskId; se consulta con /api/status (el video se guarda en videos/).
 */
export async function GET() {
  // Para que la pantalla muestre el precio de quien lo va a hacer.
  return NextResponse.json({ replicate: replicateListo() });
}

/**
 * Nuevos ángulos: el mismo video (mismas personas, palabras y tiempos) vuelto a
 * filmar desde otros ángulos. El video va como referencia ("video 1") con un
 * prompt corto de cortes con tiempos (skill GenHQ Infinite Angle).
 * Kie cobra un precio por segundo más bajo sobre (segundos del video + segundos
 * nuevos); se aparta como si fuera el precio normal y al terminar se cobra lo real.
 */
async function nuevosAngulos(request: Request, b: { video?: string; texto?: string; durVideo?: number }) {
  if (!esUrl(b.video)) return NextResponse.json({ error: 'Falta el video.' }, { status: 400 });
  const durVideo = Number(b.durVideo);
  if (!(durVideo >= 2 && durVideo <= 30)) return NextResponse.json({ error: 'El video tiene que durar de 2 a 30 segundos.' }, { status: 400 });
  const texto = typeof b.texto === 'string' ? b.texto.trim().slice(0, 6000) : '';
  if (!texto) return NextResponse.json({ error: 'Falta el prompt de los nuevos ángulos.' }, { status: 400 });
  // Un segundo más que el original, para que no se corte el final.
  const dur = Math.min(30, Math.max(4, Math.ceil(durVideo) + 1));
  const prompt = [
    'REFERENCE VIDEO: video 1 = the original footage. Keep its people, words, lip sync, actions and timing; only the camera angles change.',
    texto.replace(/@\s*video\s*1\b/gi, 'video 1'),
  ].join('\n\n');
  const result = await pedirTarea(request, 'bytedance/seedance-2-5', {
    prompt,
    reference_video_urls: [b.video],
    generate_audio: true,
    resolution: '720p',
    aspect_ratio: 'adaptive',
    duration: dur,
  }, { tipo: 'video', prompt: texto, dur: Math.ceil(durVideo) + dur });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ taskId: result.taskId });
}

export async function POST(request: Request) {
  const b = (await request.json().catch(() => null)) as {
    accion?: string; borrador?: string; refs?: { url?: string; rol?: string }[]; texto?: string;
    dur?: number; calidad?: string; formato?: string; video?: string; durVideo?: number;
  } | null;

  if (b?.accion === 'angulos') return nuevosAngulos(request, b);

  const dur = Math.round(Number(b?.dur));
  if (!(dur >= 4 && dur <= 30)) return NextResponse.json({ error: 'La duración tiene que ser de 4 a 30 segundos.' }, { status: 400 });

  // Borrador aprobado → la misma escena en 1080p.
  if (b?.accion === 'final') {
    const borrador = typeof b.borrador === 'string' ? b.borrador.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) : '';
    if (!borrador) return NextResponse.json({ error: 'Falta el borrador a pasar a 1080p.' }, { status: 400 });
    const result = await pedirTarea(request, 'bytedance/seedance-2-5-draft', { draft_task_id: borrador, resolution: '1080p' }, { tipo: 'video', prompt: 'Escena: borrador pasado a 1080p', dur });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ taskId: result.taskId });
  }

  const refs = (Array.isArray(b?.refs) ? b!.refs : [])
    .filter((r) => esUrl(r?.url) && typeof r?.rol === 'string' && ROLES[r.rol])
    .slice(0, 9) as { url: string; rol: string }[];
  if (!refs.length) return NextResponse.json({ error: 'Subí al menos una foto de referencia.' }, { status: 400 });
  const texto = typeof b?.texto === 'string' ? b.texto.trim().slice(0, 8000) : '';
  if (!texto) return NextResponse.json({ error: 'Falta la descripción de la escena con los diálogos.' }, { status: 400 });
  const calidad = b?.calidad === '1080p' || b?.calidad === '720p' ? b.calidad : 'borrador';
  const formato = b?.formato === '16:9' ? '16:9' : '9:16';

  // Las fotos van en orden: el texto le dice a la IA qué es cada una.
  const prompt = [
    `REFERENCE IMAGES, in order: ${refs.map((r, i) => `image ${i + 1} = ${ROLES[r.rol]}`).join('; ')}.`,
    'Every person must look exactly like their reference images in every frame (same face, skin, freckles, hair, body and clothes). The location must match its reference.',
    'No on-screen text, captions, subtitles, watermarks or logos.',
    texto,
  ].join('\n\n');

  const datos = { tipo: 'video' as const, prompt: texto, refs: refs.map((r) => r.url), aspect: formato, dur };
  // En Replicate las fotos se nombran [Image1], [Image2]…
  const enReplicate = (resolution: string) => pedirTareaReplicate(request, 'bytedance/seedance-2.5', {
    prompt: prompt.replace(/\bimage (\d)\b/gi, '[Image$1]'),
    reference_images: refs.map((r) => r.url),
    generate_audio: true,
    resolution,
    aspect_ratio: formato,
    duration: dur,
  }, datos);
  const enKie = () => pedirTarea(request, 'bytedance/seedance-2-5', {
    prompt,
    reference_image_urls: refs.map((r) => r.url),
    generate_audio: true,
    resolution: calidad === 'borrador' ? '480p' : calidad,
    aspect_ratio: formato,
    duration: dur,
    draft: calidad === 'borrador',
  }, datos);

  let aviso: string | undefined;
  let result = calidad === '720p' && replicateListo() ? await enReplicate('720p') : null;
  if (!result?.ok) result = await enKie();
  if (!result.ok && calidad === 'borrador' && replicateListo() && result.status !== 402) {
    const plan = await enReplicate('480p');
    if (plan.ok) { result = plan; aviso = 'Kie no respondió: se hace en Replicate en 480p. Este video no se puede pasar a 1080p.'; }
  }
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ taskId: result.taskId, aviso });
}
