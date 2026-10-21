import 'server-only';

import { leerCostos } from '@/lib/costos';
import { cuentaActual, esAdmin, versionSesion } from '@/lib/cuenta';
import { leerCuenta } from '@/lib/cuentas';
import { borrarSinCuenta, listarTodo, readJsonEn, writeJsonEn } from '@/lib/storage';

/**
 * Saldo de cada persona, en "créditos" de la app.
 *  - 1 crédito vale US$ 0,005 (igual que un crédito de Kie), así los precios se
 *    leen igual que siempre: 3.000 créditos = US$ 15.
 *  - Cada creación le cuesta a la persona lo que cobra Kie × el multiplicador
 *    que elige el administrador (por defecto ×2). La diferencia es la ganancia.
 *
 * Cada movimiento es un archivito propio en saldo/<cuenta>/ y el saldo es la
 * suma de todos. Así dos creaciones al mismo tiempo nunca se pisan el saldo.
 * Los datos de cada movimiento van en el nombre del archivo (se leen con una
 * sola consulta, sin abrir uno por uno):
 *   carga_<ref>_c<milésimas>_u<centavos US$ cobrados>_m<medio>.json
 *   ajuste_<ref>_c<milésimas, "m" adelante si resta>.json
 *   reserva_<taskId>_c<milésimas>.json   (mientras la IA trabaja)
 *   cobro_<ref>_c<milésimas>_k<milésimas de créditos de Kie>.json
 */
export const USD_POR_CREDITO = 0.005;
const MULT_DEF = 2;
/** Una reserva sin cobro después de 1 día se ignora (la tarea quedó colgada). */
const RESERVA_VENCE_MS = 24 * 60 * 60 * 1000;

export type Precios = { multiplicador: number };

export async function leerPrecios(): Promise<Precios> {
  const p = await readJsonEn<Partial<Precios>>('config/precios.json', {});
  const m = Number(p?.multiplicador);
  return { multiplicador: Number.isFinite(m) && m >= 1 && m <= 20 ? m : MULT_DEF };
}

export async function guardarPrecios(p: Precios): Promise<{ ok: boolean; error?: string }> {
  return writeJsonEn('config/precios.json', p);
}

/* ---------- Movimientos ---------- */

export type TipoMov = 'carga' | 'ajuste' | 'reserva' | 'cobro';
export type Mov = { tipo: TipoMov; ref: string; creditos: number; kie?: number; usd?: number; medio?: string; ts: number; url: string };

const limpiarRef = (r: string) => r.replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 64) || 'x';
const milesimas = (n: number) => Math.round(Math.abs(n) * 1000);

function nombreMov(m: { tipo: TipoMov; ref: string; creditos: number; kie?: number; usd?: number; medio?: string }): string {
  const partes = [m.tipo, limpiarRef(m.ref), `c${m.creditos < 0 ? 'm' : ''}${milesimas(m.creditos)}`];
  if (typeof m.kie === 'number') partes.push(`k${milesimas(m.kie)}`);
  if (typeof m.usd === 'number') partes.push(`u${Math.round(Math.abs(m.usd) * 100)}`);
  if (m.medio) partes.push(`m${m.medio.replace(/[^a-z]/g, '').slice(0, 20)}`);
  return `${partes.join('_')}.json`;
}

export function leerMov(pathname: string, url: string, ts: number): Mov | null {
  const nombre = pathname.split('/').pop()?.replace(/\.json$/, '') ?? '';
  const [tipo, ref, ...campos] = nombre.split('_');
  if (!['carga', 'ajuste', 'reserva', 'cobro'].includes(tipo) || !ref) return null;
  const m: Mov = { tipo: tipo as TipoMov, ref, creditos: 0, ts, url };
  for (const c of campos) {
    if (/^cm?\d+$/.test(c)) m.creditos = (c[1] === 'm' ? -1 : 1) * Number(c.replace(/^cm?/, '')) / 1000;
    else if (/^k\d+$/.test(c)) m.kie = Number(c.slice(1)) / 1000;
    else if (/^u\d+$/.test(c)) m.usd = Number(c.slice(1)) / 100;
    else if (/^m[a-z]+$/.test(c)) m.medio = c.slice(1);
  }
  return m;
}

async function anotar(cuenta: string, m: { tipo: TipoMov; ref: string; creditos: number; kie?: number; usd?: number; medio?: string; nota?: string }) {
  return writeJsonEn(`saldo/${cuenta}/${nombreMov(m)}`, { ...m, ts: Date.now() });
}

export async function movimientos(cuenta: string): Promise<Mov[]> {
  const blobs = await listarTodo(`saldo/${cuenta}/`);
  return blobs.map((b) => leerMov(b.pathname, b.url, b.uploadedAt)).filter((m): m is Mov => !!m).sort((a, b) => b.ts - a.ts);
}

/** Saldo disponible (ya descontado lo reservado por creaciones en camino). */
export function calcularSaldo(movs: Mov[]): { saldo: number; reservado: number } {
  const cobradas = new Set(movs.filter((m) => m.tipo === 'cobro').map((m) => m.ref));
  const limite = Date.now() - RESERVA_VENCE_MS;
  let saldo = 0;
  let reservado = 0;
  for (const m of movs) {
    if (m.tipo === 'carga' || m.tipo === 'ajuste') saldo += m.creditos;
    else if (m.tipo === 'cobro') saldo -= m.creditos;
    else if (m.tipo === 'reserva' && !cobradas.has(m.ref) && m.ts > limite) reservado += m.creditos;
  }
  return { saldo: saldo - reservado, reservado };
}

export async function saldoDe(cuenta: string): Promise<{ saldo: number; reservado: number }> {
  return calcularSaldo(await movimientos(cuenta));
}

/* ---------- Antes de crear: ¿le alcanza? ---------- */

export type Permiso =
  | { ok: true; cuenta: string; mult: number; reserva: number }
  | { ok: false; error: string; status: number };

const usdTxt = (creditos: number) => `US$ ${(creditos * USD_POR_CREDITO).toFixed(2).replace('.', ',')}`;

/**
 * Revisa que la cuenta del pedido pueda gastar lo estimado (en créditos de Kie).
 * El administrador no tiene límite (paga directo en Kie).
 */
export async function puedeGastar(estimadoKie: number): Promise<Permiso> {
  const cuenta = cuentaActual();
  if (esAdmin(cuenta)) return { ok: true, cuenta, mult: 1, reserva: 0 };
  if (!cuenta) return { ok: false, error: 'No autorizado.', status: 401 };
  const c = await leerCuenta(cuenta);
  if (!c) return { ok: false, error: 'Tu cuenta no existe más. Hablá con quien te dio el acceso.', status: 403 };
  if (c.bloqueada) return { ok: false, error: 'Tu cuenta está pausada. Hablá con quien te dio el acceso.', status: 403 };
  if (c.version !== versionSesion()) return { ok: false, error: 'Tu sesión venció. Salí y volvé a entrar.', status: 401 };
  const { multiplicador } = await leerPrecios();
  const necesario = Math.max(0, estimadoKie) * multiplicador;
  const { saldo } = await saldoDe(cuenta);
  if (saldo <= 0 || saldo < necesario) {
    return { ok: false, error: `No te alcanza el saldo: esto cuesta ≈ ${usdTxt(necesario)} y tenés ${usdTxt(Math.max(0, saldo))}. Pedí una recarga.`, status: 402 };
  }
  return { ok: true, cuenta, mult: multiplicador, reserva: necesario };
}

/** Aparta lo estimado mientras la IA trabaja (así no se gasta dos veces el mismo saldo). */
export async function reservar(p: Permiso, taskId: string): Promise<void> {
  if (!p.ok || esAdmin(p.cuenta) || p.reserva <= 0) return;
  await anotar(p.cuenta, { tipo: 'reserva', ref: taskId, creditos: p.reserva }).catch(() => undefined);
}

async function borrarReservas(cuenta: string, taskId: string) {
  const blobs = await listarTodo(`saldo/${cuenta}/reserva_${limpiarRef(taskId)}_`);
  await Promise.all(blobs.map((b) => borrarSinCuenta(b.url)));
}

/**
 * Terminó bien: se cobra lo que cobró Kie × el multiplicador del momento en que
 * se pidió (si Kie no informó el costo, lo reservado). Repetirlo no cobra dos
 * veces: el archivo del cobro tiene siempre el mismo nombre.
 */
export async function cobrarTarea(cuenta: string, taskId: string, kie: number | undefined, mult: number, reserva: number): Promise<void> {
  if (!cuenta || esAdmin(cuenta)) return;
  const conocido = typeof kie === 'number' && Number.isFinite(kie) && kie >= 0;
  const creditos = conocido ? kie * mult : reserva;
  await anotar(cuenta, { tipo: 'cobro', ref: taskId, creditos, kie: conocido ? kie : reserva / Math.max(1, mult) });
  await borrarReservas(cuenta, taskId).catch(() => undefined);
}

/** Falló: se devuelve lo reservado. */
export async function liberarReserva(cuenta: string, taskId: string): Promise<void> {
  if (!cuenta || esAdmin(cuenta)) return;
  await borrarReservas(cuenta, taskId).catch(() => undefined);
}

/** Lo mínimo que tiene que tener una cuenta para usar la IA de texto (no es un precio: se cobra lo que informa Kie). */
export const TEXTO_ESTIMADO = 5;

/** Cobro inmediato (textos de la IA: guiones, traducciones, descripción de ropa). */
export async function cobrarAhora(p: Permiso, kie: number | undefined): Promise<void> {
  if (!p.ok || esAdmin(p.cuenta) || typeof kie !== 'number' || !(kie > 0)) return;
  await anotar(p.cuenta, { tipo: 'cobro', ref: `txt-${crypto.randomUUID().slice(0, 8)}`, creditos: kie * p.mult, kie }).catch(() => undefined);
}

/** Créditos de Kie → créditos que ve la persona (para mostrar costos y precios). */
export async function factorCuenta(): Promise<number> {
  return esAdmin() ? 1 : (await leerPrecios()).multiplicador;
}

/* ---------- Administrador ---------- */

export async function cargarSaldo(cuenta: string, creditos: number, usd: number, medio: string, nota: string) {
  return anotar(cuenta, { tipo: 'carga', ref: crypto.randomUUID().slice(0, 8), creditos, usd, medio, nota: nota.slice(0, 200) });
}

export async function ajustarSaldo(cuenta: string, creditos: number, nota: string) {
  return anotar(cuenta, { tipo: 'ajuste', ref: crypto.randomUUID().slice(0, 8), creditos, nota: nota.slice(0, 200) });
}

/* ---------- Cuánto cuesta crear (para reservar antes) ---------- */

/**
 * Precios publicados por Kie (kie.ai, revisados el 15/10/2026) para los videos
 * hablados, que dependen de la duración. Para el resto se usa el último costo
 * real que cobró Kie por ese mismo tipo de creación.
 */
const OMNI: Record<number, number> = { 4: 63, 6: 84, 8: 105, 10: 126 };
/** Seedance 2.5 sin video de entrada, por segundo (kie.ai/seedance-2-5, revisado el 20/10/2026). */
export const SEEDANCE_SEG: Record<string, number> = { '480p': 28, '720p': 63, '1080p': 158 };
/** Si nunca se hizo ese tipo de creación, se aparta esto por las dudas (no es un precio: al terminar se cobra lo real). */
const RESERVA_SIN_DATOS = 200;

export async function estimarKie(model: string, input: Record<string, unknown>, dur?: number): Promise<number> {
  const d = Number(dur ?? input.duration) || 0;
  if (model === 'gemini-omni-video' && OMNI[d]) return OMNI[d];
  if (model === 'kling-3.0/video' && d > 0) return d * (input.mode === 'pro' ? 27 : 20);
  if (model === 'bytedance/seedance-2-5' && d > 0) return d * (SEEDANCE_SEG[String(input.resolution)] ?? SEEDANCE_SEG['720p']);
  const v = input.mode ?? input.resolution ?? input.quality;
  const clave = `${model}|${typeof v === 'string' ? v : ''}`;
  const costos = await leerCostos();
  const seg = costos[`${clave}|seg`]?.credits;
  if (typeof seg === 'number' && d > 0) return seg * d;
  // Borrador → 1080p: Kie no publica su precio; mientras no haya uno real, se aparta como un 1080p entero.
  if (model === 'bytedance/seedance-2-5-draft' && d > 0) return d * SEEDANCE_SEG['1080p'];
  const ult = costos[clave]?.credits;
  return typeof ult === 'number' ? ult : RESERVA_SIN_DATOS;
}
