import 'server-only';

import { promises as fs } from 'node:fs';
import path from 'node:path';

import { CUENTA_ADMIN } from '@/lib/auth';
import { cuentaActual } from '@/lib/cuenta';
import { archivoAss, cuesEditados, duracionEditada, filtroFfmpeg, medidasSalida, tramosConVoz, type CueIA, type Palabra } from '@/lib/edicion/plan';
import { conCarpetaTemporal, correrFfmpeg, duracionDeLog, urlDeMotion, urlDeVideoPropio } from '@/lib/ffmpeg';
import { crearPrediccion, leerPrediccion } from '@/lib/ia/replicate';
import { pedirDatos } from '@/lib/ia/texto';
import { cobrarAhora, puedeGastar, TEXTO_ESTIMADO } from '@/lib/saldo';
import { readJsonEn, uploadPublic, writeJsonEn } from '@/lib/storage';

/**
 * Edición automática de un video de la Galería, en dos pasos:
 *  1. empezarEdicion: saca el audio y lo manda a transcribir (WhisperX en
 *     Replicate, con el tiempo de cada palabra).
 *  2. renderEdicion: con las palabras, la IA de texto escribe los subtítulos
 *     en español rioplatense y ffmpeg corta las pausas, alterna acercamientos,
 *     agranda a 1080 y dibuja los subtítulos. El resultado va a la Galería.
 * El estado se guarda en tareas/ed-<id>.json (si el celular se cierra, el
 * video igual queda en la Galería).
 */

/** WhisperX (victor-upmeet/whisperx), versión fija para que no cambie sola. */
const WHISPERX = 'victor-upmeet/whisperx:655845d6190ef70573c669245f245892cd039df4b880a1e3a65852c09252f5cc';
/**
 * Transcribir cuesta unos segundos de GPU en Replicate (≈ US$0,01 un video de
 * 20 s). Se cobra este fijo, en créditos de Kie (US$0,005 c/u), más lo que
 * informa Kie por los subtítulos.
 */
export const CREDITOS_TRANSCRIBIR = 4;
export const DURACION_MAX = 60;
const CARPETA_FUENTES = path.join(process.cwd(), 'assets', 'fuentes');

export type Edicion = {
  id: string;
  cuenta: string;
  mult: number;
  url: string;
  dur: number;
  ancho: number;
  alto: number;
  prediccion: string;
  estado: 'escuchando' | 'transcripto' | 'editando' | 'listo' | 'fallo';
  palabras?: Palabra[];
  idioma?: string;
  resultado?: string;
  error?: string;
  inicioEdicion?: number;
  ts: number;
};

const ruta = (id: string) => `tareas/ed-${id.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 40)}.json`;
const guardar = (e: Edicion) => writeJsonEn(ruta(e.id), e);

/** La ficha, solo si es de la cuenta del pedido. */
export async function leerEdicion(id: string): Promise<Edicion | null> {
  const e = await readJsonEn<Edicion | null>(ruta(id), null);
  return e && e.cuenta === (cuentaActual() || CUENTA_ADMIN) ? e : null;
}

/** Medidas, duración y si tiene sonido (del log de ffmpeg). */
function datosDelVideo(log: string): { dur: number; ancho: number; alto: number; audio: boolean } {
  const m = /Video: [^\n]*?, (\d{2,5})x(\d{2,5})/.exec(log);
  let ancho = m ? Number(m[1]) : 0;
  let alto = m ? Number(m[2]) : 0;
  // Videos de celular girados: las medidas vienen al revés.
  if (/rotation of -?90|rotate\s*:\s*-?(90|270)/.test(log)) [ancho, alto] = [alto, ancho];
  return { dur: duracionDeLog(log), ancho, alto, audio: /Stream #[^\n]*Audio:/.test(log) };
}

async function bajar(url: URL, archivo: string): Promise<boolean> {
  const r = await fetch(url.toString(), { cache: 'no-store' });
  if (!r.ok) return false;
  await fs.writeFile(archivo, new Uint8Array(await r.arrayBuffer()));
  return true;
}

/** Paso 1: revisa el video, aparta lo que cuesta y manda el audio a transcribir. */
export async function empezarEdicion(url: string): Promise<{ ok: true; id: string } | { ok: false; error: string; status: number }> {
  const u = urlDeVideoPropio(url) ?? urlDeMotion(url);
  if (!u) return { ok: false, error: 'Solo se pueden editar videos de tu Galería.', status: 400 };
  const permiso = await puedeGastar(CREDITOS_TRANSCRIBIR + TEXTO_ESTIMADO);
  if (!permiso.ok) return permiso;

  const prep = await conCarpetaTemporal(async (dir) => {
    const video = path.join(dir, 'video');
    if (!(await bajar(u, video))) return { error: 'No se pudo leer el video. Probá de nuevo.' };
    const datos = datosDelVideo((await correrFfmpeg(['-hide_banner', '-i', video])).log);
    if (!datos.audio) return { error: 'Este video no tiene sonido: no hay voz para subtitular.' };
    if (!(datos.dur > 0) || !datos.ancho) return { error: 'No se pudo leer el video.' };
    if (datos.dur > DURACION_MAX) return { error: `La edición automática es para videos de hasta ${DURACION_MAX} s (este dura ${Math.round(datos.dur)} s).` };
    // Audio liviano (mono, 16 kHz) para mandarlo directo, sin guardarlo.
    const mp3 = path.join(dir, 'voz.mp3');
    const { code } = await correrFfmpeg(['-hide_banner', '-y', '-i', video, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '24k', mp3]);
    if (code !== 0) return { error: 'No se pudo sacar el audio del video.' };
    return { datos, audio: `data:audio/mpeg;base64,${(await fs.readFile(mp3)).toString('base64')}` };
  }).catch(() => ({ error: 'No se pudo preparar el video. Probá de nuevo.' }));
  if ('error' in prep && prep.error) return { ok: false, error: prep.error, status: 400 };
  const { datos, audio } = prep as { datos: ReturnType<typeof datosDelVideo>; audio: string };

  const p = await crearPrediccion(WHISPERX, { audio_file: audio, align_output: true, batch_size: 32 });
  if (!p.ok) return { ok: false, error: p.error, status: 502 };
  const id = crypto.randomUUID().slice(0, 18);
  const e: Edicion = { id, cuenta: permiso.cuenta, mult: permiso.mult, url, dur: datos.dur, ancho: datos.ancho, alto: datos.alto, prediccion: p.id, estado: 'escuchando', ts: Date.now() };
  const g = await guardar(e);
  if (!g.ok) return { ok: false, error: 'No se pudo guardar el pedido. Probá de nuevo.', status: 500 };
  return { ok: true, id };
}

/** Palabras de WhisperX (algunas, como los números, pueden venir sin tiempo). */
function palabrasDe(output: unknown): { palabras: Palabra[]; idioma?: string } {
  const o = output as { segments?: { start?: number; end?: number; words?: { word?: string; start?: number; end?: number }[] }[]; detected_language?: string } | null;
  const palabras: Palabra[] = [];
  for (const s of o?.segments ?? []) {
    for (const w of s.words ?? []) {
      const texto = String(w.word ?? '').trim();
      if (!texto) continue;
      const prev = palabras[palabras.length - 1];
      const ini = typeof w.start === 'number' ? w.start : prev ? prev.e : s.start ?? 0;
      const fin = typeof w.end === 'number' ? w.end : ini + 0.2;
      palabras.push({ w: texto, s: ini, e: Math.max(ini, fin) });
    }
  }
  return { palabras, idioma: o?.detected_language };
}

/** Consulta el paso 1 (rápido). */
export async function avanzarEdicion(e: Edicion): Promise<Edicion> {
  if (e.estado !== 'escuchando') return e;
  const r = await leerPrediccion(e.prediccion);
  if (r.estado === 'trabajando') return e;
  const nueva: Edicion = r.estado === 'fallo'
    ? { ...e, estado: 'fallo', error: r.error }
    : (() => {
      const { palabras, idioma } = palabrasDe(r.output);
      return palabras.length
        ? { ...e, estado: 'transcripto' as const, palabras, idioma }
        : { ...e, estado: 'fallo' as const, error: 'No se escucha ninguna voz en el video.' };
    })();
  await guardar(nueva);
  return nueva;
}

const HERRAMIENTA = {
  name: 'entregar_subtitulos',
  description: 'Entrega los subtítulos.',
  input_schema: {
    type: 'object',
    required: ['cues'],
    properties: {
      cues: {
        type: 'array',
        items: {
          type: 'object',
          required: ['desde', 'hasta', 'es', 'clave'],
          properties: {
            desde: { type: 'integer', description: 'Index of the first word covered.' },
            hasta: { type: 'integer', description: 'Index of the last word covered (inclusive).' },
            es: { type: 'string', description: 'The subtitle in Rioplatense Spanish, one short line.' },
            clave: { type: 'string', description: 'The key word(s) to highlight, copied exactly from es.' },
          },
        },
      },
    },
  },
};

async function subtitulosIA(palabras: Palabra[]): Promise<{ ok: true; cues: CueIA[]; credits?: number } | { ok: false; error: string }> {
  const lista = palabras.map((p, i) => `${i} "${p.w}" ${p.s.toFixed(2)}s`).join('\n');
  const pedido = `You are a professional subtitle editor for short vertical UGC ads (TikTok / Reels). Below are the spoken words of a video, numbered, with the time each one starts.

Write Spanish subtitles in natural Rioplatense Spanish from Argentina (voseo: "mirá", "pará", "tenés", "probalo"), faithful to the meaning and the tone, not word for word.

Rules:
- Split the speech into short phrases that follow its rhythm. Each subtitle covers consecutive words, from index "desde" to index "hasta" (inclusive). Cover every word exactly once, in order: no gaps, no overlaps.
- Each subtitle is ONE short line: at most 22 characters. It stays on screen from its first word until the next subtitle starts; keep the reading speed under 16 characters per second. If it does not fit, say the same thing in fewer Spanish words.
- "clave": the one or two most important words of that subtitle, copied exactly from "es" (same accents), to highlight in color.
- Keep brand and product names exactly as spoken. Do not add anything that was not said. Keep the punctuation natural (¡! ¿? …).
- If the speech is already in Spanish, keep its words (just split it into subtitles).

Words:
${lista}

Answer by calling the tool entregar_subtitulos. If you cannot call tools, answer ONLY with the JSON object {"cues": [...]} and no other text.`;
  const r = await pedirDatos(pedido, HERRAMIENTA);
  if (!r.ok) return r;
  const cues = (r.datos as { cues?: unknown })?.cues;
  if (!Array.isArray(cues) || !cues.length) return { ok: false, error: 'La IA no devolvió los subtítulos. Probá de nuevo.' };
  return { ok: true, cues: cues as CueIA[], credits: r.credits };
}

/** Cortes de toma del video (para no arrancar un tramo con un cuadro de la toma anterior). */
async function cortesDeToma(video: string): Promise<number[]> {
  const { log } = await correrFfmpeg(['-hide_banner', '-i', video, '-an', '-vf', "scale=160:-2,select='gt(scene,0.3)',showinfo", '-f', 'null', '-']);
  return [...log.matchAll(/pts_time:([0-9.]+)/g)].map((m) => Number(m[1])).filter((t) => Number.isFinite(t));
}

/** Paso 2 (tarda ≈ 1 minuto): subtítulos, cortes y el video final en la Galería. */
export async function renderEdicion(e0: Edicion): Promise<Edicion> {
  const e = await avanzarEdicion(e0);
  if (e.estado === 'listo' || e.estado === 'fallo' || e.estado === 'escuchando') return e;
  // Si otro pedido ya la está editando (hace menos de 5 minutos), no se repite.
  if (e.estado === 'editando' && e.inicioEdicion && Date.now() - e.inicioEdicion < 5 * 60 * 1000) return e;
  await guardar({ ...e, estado: 'editando', inicioEdicion: Date.now() });
  const fallar = async (error: string) => { const f: Edicion = { ...e, estado: 'fallo', error }; await guardar(f); return f; };

  const palabras = e.palabras ?? [];
  const ia = await subtitulosIA(palabras);
  if (!ia.ok) return fallar(ia.error);

  const u = urlDeVideoPropio(e.url) ?? urlDeMotion(e.url);
  if (!u) return fallar('El video original ya no está (se borra a los 2 días).');
  const r = await conCarpetaTemporal(async (dir) => {
    const video = path.join(dir, 'video');
    if (!(await bajar(u, video))) return { error: 'El video original ya no está (se borra a los 2 días).' };
    const tramos = tramosConVoz(palabras, e.dur, await cortesDeToma(video).catch(() => []));
    if (!tramos.length || duracionEditada(tramos) < 0.5) return { error: 'No se encontraron partes con voz para armar el video.' };
    const { ancho, alto } = medidasSalida(e.ancho, e.alto);
    const subs = path.join(dir, 'subs.ass');
    await fs.writeFile(subs, archivoAss(cuesEditados(ia.cues, palabras, tramos), ancho, alto));
    const fc = path.join(dir, 'filtro.txt');
    await fs.writeFile(fc, filtroFfmpeg(tramos, ancho, alto, subs, CARPETA_FUENTES));
    const salida = path.join(dir, 'editado.mp4');
    const { code, log } = await correrFfmpeg([
      '-hide_banner', '-y', '-i', video, '-filter_complex_script', fc, '-map', '[vout]', '-map', '[aout]',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', salida,
    ]);
    if (code !== 0) return { error: `No se pudo armar el video. ${log.split('\n').filter(Boolean).slice(-2).join(' ').slice(0, 200)}` };
    const subida = await uploadPublic(`videos/editado-${e.id}.mp4`, new Uint8Array(await fs.readFile(salida)), 'video/mp4');
    return subida.url ? { url: subida.url } : { error: subida.error ?? 'No se pudo guardar el video.' };
  }).catch(() => ({ error: 'No se pudo armar el video. Probá de nuevo.' }));
  if (!('url' in r) || !r.url) return fallar(('error' in r && r.error) || 'No se pudo armar el video.');

  // Se cobra recién cuando el video está listo.
  await cobrarAhora({ ok: true, cuenta: e.cuenta, mult: e.mult, reserva: 0 }, CREDITOS_TRANSCRIBIR + (ia.credits ?? 0));
  const lista: Edicion = { ...e, estado: 'listo', resultado: r.url };
  await guardar(lista);
  return lista;
}
