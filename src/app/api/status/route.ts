import { NextResponse } from 'next/server';

import { getTask } from '@/lib/ia/kie';
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
  try {
    const imgRes = await fetch(task.imageUrl, { cache: 'no-store' });
    if (!imgRes.ok) throw new Error(`HTTP ${imgRes.status}`);
    const bytes = new Uint8Array(await imgRes.arrayBuffer());
    const ct = imgRes.headers.get('content-type') ?? 'image/png';
    const ext = ct.includes('webp') ? 'webp' : ct.includes('jpeg') || ct.includes('jpg') ? 'jpg' : 'png';
    const { url, error } = await uploadPublic(`results/${taskId}.${ext}`, bytes, ct);
    if (error || !url) {
      return NextResponse.json({ state: 'success', url: task.imageUrl, credits: task.credits, stored: false });
    }
    return NextResponse.json({ state: 'success', url, credits: task.credits, stored: true });
  } catch {
    return NextResponse.json({ state: 'success', url: task.imageUrl, credits: task.credits, stored: false });
  }
}
