import 'server-only';

/**
 * Adaptador de Kie.ai (único punto de contacto con el proveedor).
 * Verificado en docs.kie.ai:
 *  - POST https://api.kie.ai/api/v1/jobs/createTask   { model, input }
 *  - GET  https://api.kie.ai/api/v1/jobs/recordInfo?taskId=...
 *  - Auth: header  Authorization: Bearer <KIE_API_KEY>
 *  - La generación es asíncrona: createTask devuelve un taskId y hay que
 *    consultar recordInfo hasta que data.state sea "success" o "fail".
 */
const BASE = 'https://api.kie.ai/api/v1';

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.KIE_API_KEY ?? ''}`,
    'Content-Type': 'application/json',
  };
}

export type CreateResult =
  | { ok: true; taskId: string }
  | { ok: false; error: string };

/** Crea una tarea de generación y devuelve su taskId. */
export async function createTask(
  model: string,
  input: Record<string, unknown>,
  callBackUrl?: string,
): Promise<CreateResult> {
  if (!process.env.KIE_API_KEY) {
    return { ok: false, error: 'Falta configurar la clave de Kie (KIE_API_KEY).' };
  }

  let res: Response;
  try {
    res = await fetch(`${BASE}/jobs/createTask`, {
      method: 'POST',
      headers: authHeaders(),
      cache: 'no-store',
      body: JSON.stringify(callBackUrl ? { model, callBackUrl, input } : { model, input }),
    });
  } catch {
    return { ok: false, error: 'No se pudo conectar con Kie.ai. Probá de nuevo.' };
  }

  const data = (await res.json().catch(() => null)) as
    | { code?: number; msg?: string; data?: { taskId?: string; task_id?: string } }
    | null;

  if (res.status === 401 || res.status === 403) {
    return { ok: false, error: 'La clave de Kie no es válida.' };
  }
  if (res.status === 429) {
    return { ok: false, error: 'Kie está recibiendo muchos pedidos. Esperá unos segundos y reintentá.' };
  }
  if (!res.ok || !data || (typeof data.code === 'number' && data.code !== 200)) {
    return { ok: false, error: friendlyMessage(data?.msg) };
  }

  const taskId = data.data?.taskId ?? data.data?.task_id;
  if (!taskId) {
    return { ok: false, error: 'Kie no devolvió un identificador de tarea.' };
  }
  return { ok: true, taskId };
}

export type TaskStatus =
  | { state: 'running' }
  | { state: 'success'; imageUrl: string; credits?: number; costoClave?: string }
  | { state: 'fail'; error: string };

/** Consulta el estado de una tarea. */
export async function getTask(taskId: string): Promise<TaskStatus> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${process.env.KIE_API_KEY ?? ''}` },
      cache: 'no-store',
    });
  } catch {
    // Fallo de red puntual: seguimos consultando.
    return { state: 'running' };
  }

  const data = (await res.json().catch(() => null)) as
    | { data?: { state?: string; resultJson?: string; failCode?: string; failMsg?: string; creditsConsumed?: number; model?: string; param?: string } }
    | null;
  const d = data?.data;
  if (!d) return { state: 'running' };

  if (d.state === 'success') {
    let url = '';
    try {
      const parsed = JSON.parse(d.resultJson ?? '{}') as { resultUrls?: string[]; resultUrl?: string };
      url = parsed.resultUrls?.[0] ?? parsed.resultUrl ?? '';
    } catch {
      url = '';
    }
    if (!url) return { state: 'fail', error: 'La generación terminó pero no vino la imagen.' };
    return { state: 'success', imageUrl: url, credits: d.creditsConsumed, costoClave: claveDeCosto(d.model, d.param) };
  }

  if (d.state === 'fail') {
    return { state: 'fail', error: friendlyFail(d.failMsg) };
  }

  // waiting | queuing | generating
  return { state: 'running' };
}

/** Traduce mensajes de error del proveedor a español claro. */
function friendlyMessage(msg?: string): string {
  const m = (msg ?? '').toLowerCase();
  if (m.includes('credit') || m.includes('balance') || m.includes('insufficient')) {
    return 'Te quedaste sin crédito en Kie. Cargá saldo y reintentá.';
  }
  if (m.includes('unauthorized') || m.includes('api key') || m.includes('token')) {
    return 'La clave de Kie no es válida.';
  }
  return msg ? `Kie devolvió un error: ${msg}` : 'Kie devolvió un error al crear la tarea.';
}

function friendlyFail(failMsg?: string): string {
  const m = (failMsg ?? '').toLowerCase();
  // Motion control: no encontró una persona en el video o en la foto.
  if (m.includes('character') && m.includes('video')) {
    return 'La IA no encontró a una persona en el video de referencia. Usá un video donde se vea UNA sola persona, clara y de frente, de la cabeza a la cintura (no muy lejos, bien iluminada, sin textos ni partes de la pantalla de TikTok/Instagram encima).';
  }
  if (m.includes('character') && (m.includes('image') || m.includes('picture') || m.includes('photo'))) {
    return 'La IA no encontró a tu modelo en la foto. Elegí una foto donde se la vea clara, de la cabeza a la cintura (mejor medio cuerpo o cuerpo entero).';
  }
  if (m.includes('nsfw') || m.includes('sensitive') || m.includes('content') || m.includes('policy')) {
    return 'La IA rechazó la imagen por su contenido. Probá con otra descripción.';
  }
  if (m.includes('credit') || m.includes('balance') || m.includes('insufficient')) {
    return 'Te quedaste sin crédito en Kie. Cargá saldo y reintentá.';
  }
  if (m.includes('timeout')) {
    return 'Se tardó demasiado. Probá de nuevo.';
  }
  return failMsg ? `La generación falló: ${failMsg}` : 'La generación falló. Probá de nuevo.';
}

/**
 * Clave para recordar cuánto cuesta cada tipo de generación: modelo + su
 * calidad (mode / resolution / quality). Ej: "seedream/4.5-edit|basic",
 * "kling-3.0/motion-control|720p". La app arma la misma clave para estimar.
 */
export function claveDeCosto(model?: string, param?: string): string | undefined {
  if (!model) return undefined;
  let calidad = '';
  try {
    const p = JSON.parse(param ?? '{}') as { input?: unknown };
    const input = (typeof p.input === 'string' ? JSON.parse(p.input) : p.input) as Record<string, unknown> | undefined;
    const v = input?.mode ?? input?.resolution ?? input?.quality;
    if (typeof v === 'string') calidad = v;
  } catch { /* sin calidad */ }
  return `${model}|${calidad}`;
}

/** Saldo de créditos de la cuenta de Kie (null si no se pudo consultar). */
export async function getCredits(): Promise<number | null> {
  if (!process.env.KIE_API_KEY) return null;
  try {
    const res = await fetch(`${BASE}/chat/credit`, { headers: authHeaders(), cache: 'no-store' });
    const data = (await res.json().catch(() => null)) as { code?: number; data?: unknown } | null;
    const n = Number(data?.data);
    return res.ok && Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}
