import 'server-only';

import { CUENTA_ADMIN } from '@/lib/auth';
import { pegarAudio } from '@/lib/audio';
import { registrarCosto } from '@/lib/costos';
import { conCuenta, cuentaActual } from '@/lib/cuenta';
import { urlDeMotion } from '@/lib/ffmpeg';
import { aplicarGrano } from '@/lib/grain';
import { createTask, getTask, type TaskStatus } from '@/lib/ia/kie';
import { crearPrediccion, leerPrediccion } from '@/lib/ia/replicate';
import { cobrarTarea, estimarKie, liberarReserva, puedeGastar, reservar, USD_POR_CREDITO } from '@/lib/saldo';
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
  /** Segundos del video de referencia (Motion): para saber cuánto cuesta cada segundo. */
  dur?: number;
  url?: string;
  credits?: number;
  aviso?: string;
  /** De quién es (sin esto = del administrador, como las tareas viejas). */
  cuenta?: string;
  /** Multiplicador de precio y saldo reservado al pedirla (para cobrar al terminar). */
  mult?: number;
  reserva?: number;
  ts: number;
};

const ruta = (taskId: string) => `tareas/${taskId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80)}.json`;

export async function leerTarea(taskId: string): Promise<Tarea | null> {
  return readJsonEn<Tarea | null>(ruta(taskId), null);
}

/**
 * La ficha de una tarea, solo si es de la cuenta del pedido, con el costo en
 * los créditos de esa cuenta (lo que se le cobró).
 */
export async function fichaPropia(taskId: string): Promise<Tarea | null> {
  const f = await leerTarea(taskId);
  const cuenta = cuentaActual();
  if (!f || (f.cuenta || CUENTA_ADMIN) !== cuenta) return null;
  if (cuenta !== CUENTA_ADMIN && typeof f.credits === 'number') return { ...f, credits: f.credits * (f.mult ?? 1) };
  return f;
}

/** Anota un pedido recién creado (reintenta una vez: de esta ficha depende a quién se le cobra y dónde se guarda). */
export async function registrarTarea(taskId: string, datos: Omit<Tarea, 'ts'>): Promise<void> {
  const audio = datos.audio && urlDeMotion(datos.audio) ? datos.audio : undefined;
  const refs = Array.isArray(datos.refs) ? datos.refs.filter((u) => typeof u === 'string' && u.startsWith('http')).slice(0, 8) : undefined;
  const ficha = {
    ...datos,
    cuenta: datos.cuenta ?? (cuentaActual() || undefined),
    prompt: datos.prompt?.slice(0, 6000),
    refs,
    audio,
    dur: typeof datos.dur === 'number' && Number.isFinite(datos.dur) && datos.dur > 0 ? Math.min(60, datos.dur) : undefined,
    ts: Date.now(),
  };
  const r = await writeJsonEn(ruta(taskId), ficha).catch(() => ({ ok: false }));
  if (!r.ok) await writeJsonEn(ruta(taskId), ficha).catch(() => undefined);
}

/**
 * Pide una creación a la IA cobrándosela a la cuenta del pedido: estima el
 * costo, revisa que le alcance el saldo, crea la tarea, aparta el saldo y
 * anota la ficha. El administrador no tiene límite.
 */
export async function pedirTarea(
  request: Request,
  model: string,
  input: Record<string, unknown>,
  datos: Omit<Tarea, 'ts' | 'cuenta' | 'mult' | 'reserva'>,
): Promise<{ ok: true; taskId: string } | { ok: false; error: string; status: number }> {
  const permiso = await puedeGastar(await estimarKie(model, input, datos.dur));
  if (!permiso.ok) return permiso;
  const result = await createTask(model, input, urlDeAviso(request));
  if (!result.ok) return { ok: false, error: result.error, status: 502 };
  await reservar(permiso, result.taskId);
  await registrarTarea(result.taskId, { ...datos, cuenta: permiso.cuenta, mult: permiso.mult, reserva: permiso.reserva });
  return { ok: true, taskId: result.taskId };
}

/* ---------- Replicate (segundo proveedor) ---------- */

/** Las tareas de Replicate llevan este prefijo en su id (así se sabe a quién preguntar). */
export const PREFIJO_REPLICATE = 'rep_';
/**
 * Seedance 2.5 en Replicate, US$ por segundo de video, sin video de entrada
 * (replicate.com/bytedance/seedance-2.5, revisado el 23/10/2026). En créditos
 * de Kie (US$ 0,005) para cobrar igual que todo lo demás.
 */
export const SEEDANCE_REPLICATE_USD: Record<string, number> = { '480p': 0.1028, '720p': 0.2312 };
export const seedanceReplicateCreditos = (resolucion: string, dur: number) =>
  ((SEEDANCE_REPLICATE_USD[resolucion] ?? SEEDANCE_REPLICATE_USD['720p']) * dur) / USD_POR_CREDITO;

/**
 * Como pedirTarea, pero en Replicate. `modelo` se anota en la ficha como
 * "replicate:<modelo>|<resolución>" para calcular lo que costó al terminar.
 */
export async function pedirTareaReplicate(
  request: Request,
  modelo: string,
  input: Record<string, unknown>,
  datos: Omit<Tarea, 'ts' | 'cuenta' | 'mult' | 'reserva' | 'modelo'>,
): Promise<{ ok: true; taskId: string } | { ok: false; error: string; status: number }> {
  const resolucion = String(input.resolution ?? '720p');
  const permiso = await puedeGastar(seedanceReplicateCreditos(resolucion, Number(datos.dur) || 0));
  if (!permiso.ok) return permiso;
  const r = await crearPrediccion(modelo, input, `${new URL(request.url).origin}/api/replicate-callback`);
  if (!r.ok) return { ok: false, error: r.error, status: 502 };
  const taskId = `${PREFIJO_REPLICATE}${r.id}`;
  await reservar(permiso, taskId);
  await registrarTarea(taskId, { ...datos, modelo: `replicate:${modelo}|${resolucion}`, cuenta: permiso.cuenta, mult: permiso.mult, reserva: permiso.reserva });
  return { ok: true, taskId };
}

/** Estado de una tarea de Replicate, con la misma forma que las de Kie. */
async function tareaReplicate(taskId: string, ficha: Tarea | null): Promise<TaskStatus> {
  const r = await leerPrediccion(taskId.slice(PREFIJO_REPLICATE.length));
  if (r.estado === 'trabajando') return { state: 'running' };
  if (r.estado === 'fallo') return { state: 'fail', error: r.error };
  const url = typeof r.output === 'string' ? r.output : Array.isArray(r.output) && typeof r.output[0] === 'string' ? r.output[0] : '';
  if (!url) return { state: 'fail', error: 'Replicate terminó pero no vino el video.' };
  const resolucion = ficha?.modelo?.split('|')[1] ?? '720p';
  return { state: 'success', imageUrl: url, credits: ficha?.dur ? seedanceReplicateCreditos(resolucion, ficha.dur) : undefined };
}

/** Dirección para que Kie avise cuando termina. */
export function urlDeAviso(request: Request): string {
  return `${new URL(request.url).origin}/api/kie-callback`;
}

export type Estado =
  | { state: 'running' }
  | { state: 'fail'; error: string }
  | { state: 'success'; url: string; kind: 'image' | 'video'; credits?: number; stored: boolean; aviso?: string };

/**
 * Consulta la tarea y, si terminó, guarda el resultado (una sola vez) en la
 * carpeta de su cuenta y le cobra. Con `quien`, solo responde si la tarea es
 * de esa cuenta (nadie puede espiar las creaciones de otra persona).
 */
export async function terminarTarea(taskId: string, quien?: string): Promise<Estado> {
  const ficha = await leerTarea(taskId);
  const duena = ficha?.cuenta || CUENTA_ADMIN;
  if (quien !== undefined && quien !== duena) return { state: 'fail', error: 'No se encontró esta creación.' };
  const estado = await conCuenta(duena, () => terminarDe(taskId, ficha, duena));
  // Cada persona ve lo que se le cobró (créditos de Kie × su multiplicador), no lo que cobró Kie.
  if (estado.state === 'success' && typeof estado.credits === 'number' && duena !== CUENTA_ADMIN) {
    estado.credits = estado.credits * (ficha?.mult ?? 1);
  }
  return estado;
}

async function terminarDe(taskId: string, ficha: Tarea | null, duena: string): Promise<Estado> {
  if (ficha?.url) {
    return { state: 'success', url: ficha.url, kind: ficha.tipo === 'video' ? 'video' : 'image', credits: ficha.credits, stored: true, aviso: ficha.aviso };
  }

  const task = taskId.startsWith(PREFIJO_REPLICATE) ? await tareaReplicate(taskId, ficha) : await getTask(taskId);
  if (task.state === 'running') return { state: 'running' };
  if (task.state === 'fail') {
    await liberarReserva(duena, taskId);
    return { state: 'fail', error: task.error };
  }

  // Se cobra apenas termina bien (repetirlo no cobra dos veces).
  await cobrarTarea(duena, taskId, task.credits, ficha?.mult ?? 1, ficha?.reserva ?? 0).catch(() => undefined);

  // Guardamos cuánto costó este tipo de generación (para estimar las próximas).
  await registrarCosto(task.costoClave, task.credits).catch(() => undefined);
  // Motion se cobra por segundo: guardamos también el costo de cada segundo (para estimar antes de crear).
  if (task.costoClave && typeof task.credits === 'number' && ficha?.dur && ficha.dur >= 1) {
    await registrarCosto(`${task.costoClave}|seg`, task.credits / ficha.dur).catch(() => undefined);
  }

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
