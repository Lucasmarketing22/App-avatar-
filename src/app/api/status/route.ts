import { NextResponse } from 'next/server';

import { getTask } from '@/lib/ia/kie';
import { aplicarGrano } from '@/lib/grain';
import { uploadPublic } from '@/lib/storage';

export const runtime = 'nodejs';
// La consulta es rápida (no espera minutos): el navegador la repite cada pocos
// segundos. Aun así damos margen por si toca descargar+guardar el resultado.
export const maxDuration = 60;

export async function GET(request: Request) {
  const taskId = new URL(request.url).searchParams.get('taskId');
  if (!taskId) {
    return NextResponse.json({ error: 'Falta el identificador de la tarea.' }, { status: 400 });
  }

  const task = await getTask(taskId);

  if (task.state === 'running') {
    return NextResponse.json({ state: 'running' });
  }
  if (task.state === 'fail') {
    return NextResponse.json({ state: 'fail', error: task.error });
  }

  // Éxito: copiamos la imagen a nuestro almacenamiento (las de Kie vencen ~14
  // días). Si algo falla al guardar, igual mostramos la de Kie.
  // Detectamos si el resultado es video (mp4) o imagen, por la URL o el
  // content-type, y lo guardamos en la carpeta correcta.
  const esVideoUrl = /\.(mp4|webm|mov)(\?|$)/i.test(task.imageUrl);
  try {
    const r = await fetch(task.imageUrl, { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    let bytes = new Uint8Array(await r.arrayBuffer());
    let ct = r.headers.get('content-type') ?? (esVideoUrl ? 'video/mp4' : 'image/png');
    const esVideo = esVideoUrl || ct.includes('video');
    const kind = esVideo ? 'video' : 'image';
    const folder = esVideo ? 'videos' : 'results';
    let ext = esVideo ? 'mp4' : ct.includes('webp') ? 'webp' : ct.includes('jpeg') || ct.includes('jpg') ? 'jpg' : 'png';

    // Grano fotográfico automático (solo imágenes): realismo sin tocar la cara.
    if (!esVideo) {
      const conGrano = await aplicarGrano(bytes);
      if (conGrano) { bytes = new Uint8Array(conGrano); ct = 'image/jpeg'; ext = 'jpg'; }
    }

    const { url, error } = await uploadPublic(`${folder}/${taskId}.${ext}`, bytes, ct);
    if (error || !url) {
      return NextResponse.json({ state: 'success', url: task.imageUrl, kind, credits: task.credits, stored: false });
    }
    return NextResponse.json({ state: 'success', url, kind, credits: task.credits, stored: true });
  } catch {
    return NextResponse.json({ state: 'success', url: task.imageUrl, kind: esVideoUrl ? 'video' : 'image', credits: task.credits, stored: false });
  }
}
