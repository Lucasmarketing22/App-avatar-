import { NextResponse } from 'next/server';

import { pedirTarea } from '@/lib/tareas';

export const runtime = 'nodejs';

const esUrl = (u: unknown): u is string => typeof u === 'string' && u.startsWith('https://');

/** Qué es cada foto de referencia (así la IA sabe quién es quién). */
const ROLES: Record<string, string> = {
  a: 'Person A (a character: keep her face, hair, body and outfit exactly)',
  b: 'Person B (a character: keep her face, hair, body and outfit exactly)',
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
 * Devuelve taskId; se consulta con /api/status (el video se guarda en videos/).
 */
export async function POST(request: Request) {
  const b = (await request.json().catch(() => null)) as {
    accion?: string; borrador?: string; refs?: { url?: string; rol?: string }[]; texto?: string;
    dur?: number; calidad?: string; formato?: string;
  } | null;

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
  if (!refs.some((r) => ['a', 'b', 'c'].includes(r.rol))) return NextResponse.json({ error: 'Subí al menos una foto de una persona.' }, { status: 400 });
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

  const result = await pedirTarea(request, 'bytedance/seedance-2-5', {
    prompt,
    reference_image_urls: refs.map((r) => r.url),
    generate_audio: true,
    resolution: calidad === 'borrador' ? '480p' : calidad,
    aspect_ratio: formato,
    duration: dur,
    draft: calidad === 'borrador',
  }, { tipo: 'video', prompt: texto, refs: refs.map((r) => r.url), aspect: formato, dur });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ taskId: result.taskId });
}
