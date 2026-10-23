import 'server-only';

import { promises as fs } from 'node:fs';
import path from 'node:path';

import { CUENTA_ADMIN } from '@/lib/auth';
import { cuentaActual } from '@/lib/cuenta';
import { limpiarOpciones, type OpcionesEdicion } from '@/lib/edicion/opciones';
import { archivoAss, cuesEditados, duracionEditada, filtroFfmpeg, medidasSalida, tramosConVoz, type CueIA, type Palabra } from '@/lib/edicion/plan';
import { EMOJIS, planPro, type ChunkIA } from '@/lib/edicion/pro';
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
const CARPETA_EMOJIS = path.join(process.cwd(), 'assets', 'emojis');
const CARPETA_SFX = path.join(process.cwd(), 'assets', 'sfx');

export type Edicion = {
  id: string;
  cuenta: string;
  mult: number;
  url: string;
  dur: number;
  ancho: number;
  alto: number;
  prediccion: string;
  /** Qué tipo de edición eligió (las fichas viejas no lo tienen: natural). */
  opciones?: OpcionesEdicion;
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
export async function empezarEdicion(url: string, opciones?: unknown): Promise<{ ok: true; id: string } | { ok: false; error: string; status: number }> {
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
  const e: Edicion = { id, cuenta: permiso.cuenta, mult: permiso.mult, url, dur: datos.dur, ancho: datos.ancho, alto: datos.alto, prediccion: p.id, opciones: limpiarOpciones(opciones), estado: 'escuchando', ts: Date.now() };
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

const HERRAMIENTA_PRO = {
  name: 'entregar_edicion',
  description: 'Entrega los captions y los textos del cierre.',
  input_schema: {
    type: 'object',
    required: ['cues'],
    properties: {
      cues: {
        type: 'array',
        items: {
          type: 'object',
          required: ['desde', 'hasta', 'es'],
          properties: {
            desde: { type: 'integer' },
            hasta: { type: 'integer' },
            es: { type: 'string', description: '1 to 3 Spanish words, max 16 characters.' },
            clave: { type: 'string', description: 'Key word copied exactly from es, or empty.' },
            emoji: { type: 'string', enum: ['', ...EMOJIS] },
          },
        },
      },
      marca: { type: 'string', description: 'Brand name if it is said, else empty.' },
      beneficios: { type: 'array', items: { type: 'string' }, description: '3 short benefits (max 22 characters) taken from what is said.' },
      cta: { type: 'string', description: 'Short call to action in Rioplatense Spanish (max 16 characters).' },
    },
  },
};

type RespuestaPro = { cues: ChunkIA[]; marca?: string; beneficios?: string[]; cta?: string };

/** Captions cortos estilo TikTok (1–3 palabras) con palabra clave y emoji, y los textos del cierre. */
async function captionsPro(palabras: Palabra[], conCierre: boolean): Promise<{ ok: true; r: RespuestaPro; credits?: number } | { ok: false; error: string }> {
  const lista = palabras.map((p, i) => `${i} "${p.w}" ${p.s.toFixed(2)}s`).join('\n');
  const pedido = `You are a professional editor of viral vertical UGC ads (TikTok / Reels). Below are the spoken words of a video, numbered, with the time each one starts.

Write TikTok-style captions in natural Rioplatense Spanish from Argentina (voseo: "mirá", "pará", "tenés", "probalo"), faithful to the meaning and the tone, not word for word.

Rules for "cues":
- Very short captions that follow the speech: 1 to 3 Spanish words each, at most 16 characters. Each covers consecutive spoken words, from index "desde" to index "hasta" (inclusive). Cover every word exactly once, in order: no gaps, no overlaps.
- "clave": in about half of the captions, the one word that matters most, copied exactly from "es" (same accents). Empty otherwise.
- "emoji": only on the most important moments (roughly one caption out of three, never two in a row), and only when one of these fits the meaning: ${EMOJIS.join(', ')}. Empty otherwise.
- Keep brand and product names exactly as spoken. Do not add anything that was not said.
${conCierre ? `
Also, for the closing card of the ad:
- "marca": the brand name if it is said in the video, else empty.
- "beneficios": 3 short benefits (max 22 characters each) taken ONLY from what is said. Never invent claims, prices or discounts.
- "cta": a short call to action (max 16 characters), e.g. "Probalo hoy".` : ''}

Words:
${lista}

Answer by calling the tool entregar_edicion. If you cannot call tools, answer ONLY with the JSON object and no other text.`;
  const r = await pedirDatos(pedido, HERRAMIENTA_PRO);
  if (!r.ok) return r;
  const d = (r.datos ?? {}) as Partial<RespuestaPro>;
  if (!Array.isArray(d.cues) || !d.cues.length) return { ok: false, error: 'La IA no devolvió los captions. Probá de nuevo.' };
  return { ok: true, r: { cues: d.cues, marca: d.marca, beneficios: Array.isArray(d.beneficios) ? d.beneficios : undefined, cta: d.cta }, credits: r.credits };
}

/** Cuándo empieza a sonar la voz (Whisper a veces marca la primera palabra antes de que suene). */
async function inicioDeVoz(video: string): Promise<number> {
  const { log } = await correrFfmpeg(['-hide_banner', '-t', '3', '-i', video, '-vn', '-af', 'silencedetect=noise=-38dB:d=0.08', '-f', 'null', '-']);
  const ini = /silence_start: (-?[0-9.]+)/.exec(log);
  const fin = /silence_end: ([0-9.]+)/.exec(log);
  return ini && Number(ini[1]) <= 0.02 && fin ? Number(fin[1]) : 0;
}

/** Foto del cierre: medidas y color del borde de arriba (para el fondo). Solo fotos de nuestro almacenamiento. */
async function prepararFoto(url: string, dir: string): Promise<{ archivo: string; ancho: number; alto: number; fondo: string } | null> {
  try {
    const u = new URL(url);
    if (!u.hostname.endsWith('.public.blob.vercel-storage.com')) return null;
    const archivo = path.join(dir, 'foto');
    if (!(await bajar(u, archivo))) return null;
    const m = /Video: [^\n]*?, (\d{2,5})x(\d{2,5})/.exec((await correrFfmpeg(['-hide_banner', '-i', archivo])).log);
    if (!m) return null;
    const px = path.join(dir, 'color.rgb');
    await correrFfmpeg(['-hide_banner', '-y', '-i', archivo, '-vf', 'crop=iw:ih*0.04:0:0,scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', px]);
    const c = await fs.readFile(px).catch(() => null);
    const fondo = c && c.length >= 3 ? `#${[c[0], c[1], c[2]].map((n) => n.toString(16).padStart(2, '0')).join('')}` : '#e6e6e6';
    return { archivo, ancho: Number(m[1]), alto: Number(m[2]), fondo };
  } catch {
    return null;
  }
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
  const op = e.opciones ?? limpiarOpciones({ estilo: 'natural' });
  const pro = op.estilo === 'pro';
  const ia = pro ? await captionsPro(palabras, op.cierre) : await subtitulosIA(palabras);
  if (!ia.ok) return fallar(ia.error);

  const u = urlDeVideoPropio(e.url) ?? urlDeMotion(e.url);
  if (!u) return fallar('El video original ya no está (se borra a los 2 días).');
  const r = await conCarpetaTemporal(async (dir) => {
    const video = path.join(dir, 'video');
    if (!(await bajar(u, video))) return { error: 'El video original ya no está (se borra a los 2 días).' };
    const tramos = tramosConVoz(palabras, e.dur, await cortesDeToma(video).catch(() => []));
    if (!tramos.length || duracionEditada(tramos) < 0.5) return { error: 'No se encontraron partes con voz para armar el video.' };
    const subs = path.join(dir, 'subs.ass');
    const fc = path.join(dir, 'filtro.txt');
    const salida = path.join(dir, 'editado.mp4');
    let args: string[];
    if (pro && 'r' in ia) {
      // Estilo Pro: 1080×1920 (los videos de Escenas son verticales).
      const foto = op.cierre && op.foto ? await prepararFoto(op.foto, dir) : null;
      const plan = planPro({
        palabras, tramos, chunks: ia.r.cues, carpetaEmojis: CARPETA_EMOJIS, carpetaSfx: CARPETA_SFX,
        inicioVoz: await inicioDeVoz(video).catch(() => 0),
        capas: { emojis: op.emojis, sonidos: op.sonidos, movimiento: op.movimiento, color: op.color },
        cierre: foto ? {
          foto: foto.archivo, fotoAncho: foto.ancho, fotoAlto: foto.alto, fondo: foto.fondo,
          marca: op.marca ?? (ia.r.marca || undefined),
          // Los que escribió la persona primero; la IA completa hasta 3.
          beneficios: [...(op.beneficios ?? []), ...(ia.r.beneficios ?? []).filter((b) => typeof b === 'string' && b.trim())].slice(0, 3),
          cta: op.cta ?? (ia.r.cta || 'Probalo hoy'),
        } : undefined,
      });
      await fs.writeFile(subs, plan.ass);
      await fs.writeFile(fc, plan.filtro.replace('__ASS__', subs.replace(/'/g, '')).replace('__FUENTES__', CARPETA_FUENTES));
      args = ['-hide_banner', '-y', '-i', video, ...plan.entradas.flat(), '-filter_complex_script', fc, '-map', '[vout]', '-map', '[aout]',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-r', '30', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-t', plan.duracion.toFixed(3), salida];
    } else {
      const { ancho, alto } = medidasSalida(e.ancho, e.alto);
      await fs.writeFile(subs, archivoAss(cuesEditados((ia as { cues: CueIA[] }).cues, palabras, tramos), ancho, alto));
      await fs.writeFile(fc, filtroFfmpeg(tramos, ancho, alto, subs, CARPETA_FUENTES));
      args = ['-hide_banner', '-y', '-i', video, '-filter_complex_script', fc, '-map', '[vout]', '-map', '[aout]',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', salida];
    }
    const { code, log } = await correrFfmpeg(args);
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
