import 'server-only';

import { pegarAudio } from '@/lib/audio';
import { registrarCosto } from '@/lib/costos';
import { urlDeMotion } from '@/lib/ffmpeg';
import { aplicarGrano } from '@/lib/grain';
import { getTask } from '@/lib/ia/kie';
import { readJsonEn, uploadPublic, writeJsonEn } from '@/lib/storage';

/**
 * Cada pedido a la IA deja una "ficha" en tareas/<taskId>.json con sus datos
 * (prompt, referencias, formato, sonido original…). Cuando la IA termina, el
 * resultado se guarda en el almacenamiento desde el SERVIDOR: lo dispara el
 * aviso de Kie (/api/kie-callback) o la consulta del celular (/api/status), lo
 * que llegue primero. Así nada se pierde aunque el celular se bloquee o se
 * cierre la app. El archivo final siempre va al mismo lugar
 * (results/<taskId>.jpg o videos/<taskId>.mp4), así que si las dos cosas lo
 * guardan a la vez no se duplica.
 */
export type Tarea = {
  tipo: 'foto' | 'video';
  prompt?: string;
  modelo?: string;
  refs?: string[];
  aspect?: string;
  /** Video subido CON sonido: se le pega ese audio al video final. */
  audio?: string;
  url?: string;
  credits?: number;
  aviso?: string;
  ts: number;
};

const ruta = (taskId: string) => `tareas/${taskId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80)}.json`;

export async function leerTarea(taskId: string): Promise<Tarea | null> {
  return readJsonEn<Tarea | null>(ruta(taskId), null);
}

/** Anota un pedido recién creado (no frena si falla: el celular igual consulta). */
export async function registrarTarea(taskId: string, datos: Omit<Tarea, 'ts'>): Promise<void> {
  const audio = datos.audio && urlDeMotion(datos.audio) ? datos.audio : undefined;
  const refs = Array.isArray(datos.refs) ? datos.refs.filter((u) => typeof u === 'string' && u.startsWith('http')).slice(0, 8) : undefined;
  await writeJsonEn(ruta(taskId), {
    ...datos,
    prompt: datos.prompt?.slice(0, 6000),
    refs,
    audio,
    ts: Date.now(),
  }).catch(() => undefined);
}

/** Dirección para que Kie avise cuando termina. */
export function urlDeAviso(request: Request): string {
  return `${new URL(request.url).origin}/api/kie-callback`;
}

export type Estado =
  | { state: 'running' }
  | { state: 'fail'; error: string }
  | { state: 'success'; url: string; kind: 'image' | 'video'; credits?: number; stored: boolean; aviso?: string };

/** Consulta la tarea y, si terminó, guarda el resultado (una sola vez). */
export async function terminarTarea(taskId: string): Promise<Estado> {
  const ficha = await leerTarea(taskId);
  if (ficha?.url) {
    return { state: 'success', url: ficha.url, kind: ficha.tipo === 'video' ? 'video' : 'image', credits: ficha.credits, stored: true, aviso: ficha.aviso };
  }

  const task = await getTask(taskId);
  if (task.state === 'running') return { state: 'running' };
  if (task.state === 'fail') return { state: 'fail', error: task.error };

  // Guardamos cuánto costó este tipo de generación (para estimar las próximas).
  await registrarCosto(task.costoClave, task.credits).catch(() => undefined);

  // Copiamos el resultado a nuestro almacenamiento (los de Kie vencen ~14 días).
  // Si algo falla al guardar, igual mostramos el de Kie.
  const esVideoUrl = /\.(mp4|webm|mov)(\?|$)/i.test(task.imageUrl) || ficha?.tipo === 'video';
  try {
    const r = await fetch(task.imageUrl, { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    let bytes = new Uint8Array(await r.arrayBuffer());
    let ct = r.headers.get('content-type') ?? (esVideoUrl ? 'video/mp4' : 'image/png');
    const esVideo = esVideoUrl || ct.includes('video');
    let ext = esVideo ? 'mp4' : ct.includes('webp') ? 'webp' : ct.includes('jpeg') || ct.includes('jpg') ? 'jpg' : 'png';
    let aviso: string | undefined;

    if (esVideo) {
      ct = 'video/mp4';
      if (ficha?.audio) {
        const conSonido = await pegarAudio(bytes, ficha.audio);
        if (conSonido.bytes) bytes = new Uint8Array(conSonido.bytes);
        else if (conSonido.error) aviso = `El video quedó listo, pero sin el sonido original: ${conSonido.error}`;
      }
    } else {
      // Grano fotográfico automático (solo imágenes): realismo sin tocar la cara.
      const conGrano = await aplicarGrano(bytes);
      if (conGrano) { bytes = new Uint8Array(conGrano); ct = 'image/jpeg'; ext = 'jpg'; }
    }

    const { url, error } = await uploadPublic(`${esVideo ? 'videos' : 'results'}/${taskId}.${ext}`, bytes, ct);
    if (error || !url) {
      return { state: 'success', url: task.imageUrl, kind: esVideo ? 'video' : 'image', credits: task.credits, stored: false };
    }
    await writeJsonEn(ruta(taskId), { ...(ficha ?? { tipo: esVideo ? 'video' : 'foto', ts: Date.now() }), url, credits: task.credits, aviso }).catch(() => undefined);
    return { state: 'success', url, kind: esVideo ? 'video' : 'image', credits: task.credits, stored: true, aviso };
  } catch {
    return { state: 'success', url: task.imageUrl, kind: esVideoUrl ? 'video' : 'image', credits: task.credits, stored: false };
  }
}

/** El taskId sale del nombre del archivo guardado: results/<taskId>.jpg. */
export function taskIdDeUrl(url: string): string {
  try { return new URL(url).pathname.split('/').pop()!.replace(/\.[^.]+$/, ''); } catch { return ''; }
}
