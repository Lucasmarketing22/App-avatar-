import { NextResponse } from 'next/server';

import { terminarTarea } from '@/lib/tareas';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Kie avisa acá cuando una tarea termina. Guardamos el resultado desde el
 * servidor, así aparece en la galería aunque el celular esté bloqueado o la
 * app cerrada. No confiamos en lo que llega: con el taskId le volvemos a
 * preguntar a Kie (terminarTarea), así nadie puede meter archivos falsos.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { taskId?: string; data?: { taskId?: string; task_id?: string } } | null;
  const taskId = body?.data?.taskId ?? body?.data?.task_id ?? body?.taskId ?? '';
  if (typeof taskId === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(taskId)) {
    await terminarTarea(taskId).catch(() => undefined);
  }
  return NextResponse.json({ ok: true });
}
