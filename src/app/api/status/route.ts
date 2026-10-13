import { NextResponse } from 'next/server';

import { terminarTarea } from '@/lib/tareas';

export const runtime = 'nodejs';
// La consulta es rápida (no espera minutos): el navegador la repite cada pocos
// segundos. Aun así damos margen por si toca descargar+guardar el resultado
// (y pegarle el sonido original a un video).
export const maxDuration = 60;

export async function GET(request: Request) {
  const taskId = new URL(request.url).searchParams.get('taskId');
  if (!taskId) {
    return NextResponse.json({ error: 'Falta el identificador de la tarea.' }, { status: 400 });
  }
  return NextResponse.json(await terminarTarea(taskId));
}
