import 'server-only';

/**
 * Replicate (replicate.com): segundo proveedor, además de Kie. Se usa para
 * pasar la voz a texto con tiempos por palabra (edición automática) y para
 * Seedance 2.5 en 480p/720p (más barato que en Kie, revisado el 23/10/2026).
 * Requiere la variable de entorno REPLICATE_API_TOKEN.
 * API: POST /v1/predictions (con `version`) o /v1/models/<dueño>/<modelo>/predictions
 * (modelos oficiales) y GET /v1/predictions/<id>.
 */
const API = 'https://api.replicate.com/v1';

export const replicateListo = () => !!process.env.REPLICATE_API_TOKEN;
export const SIN_REPLICATE = 'Falta configurar Replicate (REPLICATE_API_TOKEN en Vercel).';

type Prediccion = { id?: string; status?: string; output?: unknown; error?: unknown; metrics?: { predict_time?: number }; detail?: string; title?: string };

const encabezados = () => ({ Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`, 'Content-Type': 'application/json' });

/** Mensaje de error de Replicate, tal cual, para saber la causa real. */
function errorDe(d: Prediccion | null, status: number): string {
  const msg = typeof d?.detail === 'string' ? d.detail : typeof d?.error === 'string' ? d.error : d?.title;
  if (status === 401) return 'La clave de Replicate no es válida (revisá REPLICATE_API_TOKEN en Vercel).';
  if (status === 402) return 'Te quedaste sin crédito en Replicate. Cargá saldo en replicate.com/account/billing.';
  return msg ? `Replicate respondió: "${msg}" (código ${status}).` : `Replicate respondió con el código ${status}.`;
}

/**
 * Crea una predicción. `modelo` es "dueño/nombre" (modelo oficial) o
 * "dueño/nombre:versión" (cualquier otro).
 */
export async function crearPrediccion(modelo: string, input: Record<string, unknown>, webhook?: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!replicateListo()) return { ok: false, error: SIN_REPLICATE };
  const [nombre, version] = modelo.split(':');
  const url = version ? `${API}/predictions` : `${API}/models/${nombre}/predictions`;
  const cuerpo: Record<string, unknown> = { input, ...(version ? { version } : {}) };
  if (webhook) { cuerpo.webhook = webhook; cuerpo.webhook_events_filter = ['completed']; }
  try {
    const r = await fetch(url, { method: 'POST', headers: encabezados(), body: JSON.stringify(cuerpo), cache: 'no-store' });
    const d = (await r.json().catch(() => null)) as Prediccion | null;
    if (!r.ok || !d?.id) return { ok: false, error: errorDe(d, r.status) };
    return { ok: true, id: d.id };
  } catch {
    return { ok: false, error: 'No se pudo conectar con Replicate.' };
  }
}

export type EstadoPrediccion =
  | { estado: 'trabajando' }
  | { estado: 'fallo'; error: string }
  | { estado: 'listo'; output: unknown; segundos?: number };

export async function leerPrediccion(id: string): Promise<EstadoPrediccion> {
  if (!replicateListo()) return { estado: 'fallo', error: SIN_REPLICATE };
  try {
    const r = await fetch(`${API}/predictions/${encodeURIComponent(id)}`, { headers: encabezados(), cache: 'no-store' });
    const d = (await r.json().catch(() => null)) as Prediccion | null;
    if (!r.ok || !d) return r.status >= 500 ? { estado: 'trabajando' } : { estado: 'fallo', error: errorDe(d, r.status) };
    if (d.status === 'succeeded') return { estado: 'listo', output: d.output, segundos: d.metrics?.predict_time };
    if (d.status === 'failed' || d.status === 'canceled') {
      return { estado: 'fallo', error: typeof d.error === 'string' && d.error ? `Replicate: ${d.error}` : 'Replicate no pudo hacerlo.' };
    }
    return { estado: 'trabajando' };
  } catch {
    return { estado: 'trabajando' };
  }
}
