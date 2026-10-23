/**
 * Edición automática: el "plan" del video (sin ffmpeg ni servicios, solo
 * cálculos). Son las mismas reglas que usa Claude al editar a mano
 * (skill musa-ugc › edicion.md):
 *  - cortar las pausas: tramos con voz, uniendo huecos < 0,28 s, con
 *    [inicio − 0,06, fin + 0,10];
 *  - la primera palabra necesita aire: el video arranca ≥ 0,25 s antes;
 *  - si un tramo empieza justo antes de un corte de toma, arranca después del
 *    corte (que no se cuele un cuadro de la otra toma);
 *  - subtítulos de una sola línea que duran hasta que empieza el siguiente,
 *    con la palabra clave en otro color y un pequeño latido.
 */

export type Palabra = { w: string; s: number; e: number };
export type Tramo = { a: number; b: number };
/** Lo que devuelve la IA: qué palabras cubre cada subtítulo y su texto en español. */
export type CueIA = { desde: number; hasta: number; es: string; clave?: string };
export type Cue = { t0: number; t1: number; es: string; clave: string };

const HUECO_MAX = 0.28;
const ANTES = 0.06;
const DESPUES = 0.1;
const AIRE_INICIAL = 0.3;
const AIRE_FINAL = 0.35;

/** Tramos del video original que se conservan (en orden, sin superponerse). */
export function tramosConVoz(palabras: Palabra[], duracion: number, cortesDeToma: number[] = []): Tramo[] {
  const ps = palabras.filter((p) => Number.isFinite(p.s) && Number.isFinite(p.e) && p.e >= p.s).sort((x, y) => x.s - y.s);
  if (!ps.length || !(duracion > 0)) return [];
  const corridas: { s: number; e: number }[] = [];
  for (const p of ps) {
    const u = corridas[corridas.length - 1];
    if (u && p.s - u.e < HUECO_MAX) u.e = Math.max(u.e, p.e);
    else corridas.push({ s: p.s, e: p.e });
  }
  const tramos: Tramo[] = corridas.map((c, i) => {
    let a = Math.max(0, c.s - (i === 0 ? AIRE_INICIAL : ANTES));
    // Un corte de toma entre el arranque y la primera palabra: arrancar después del corte.
    const corte = cortesDeToma.filter((t) => t > a && t < c.s - 0.05).pop();
    if (corte !== undefined) a = Math.min(corte + 0.04, c.s - 0.05);
    const b = Math.min(duracion, c.e + (i === corridas.length - 1 ? AIRE_FINAL : DESPUES));
    return { a, b };
  });
  // Unir los que se pisan.
  const unidos: Tramo[] = [];
  for (const t of tramos) {
    const u = unidos[unidos.length - 1];
    if (u && t.a <= u.b + 0.02) u.b = Math.max(u.b, t.b);
    else unidos.push({ ...t });
  }
  return unidos.filter((t) => t.b - t.a > 0.08);
}

/** Tiempo del video original → tiempo del video editado (lo cortado se pega al tramo siguiente). */
export function mapear(t: number, tramos: Tramo[]): number {
  let acum = 0;
  for (const tr of tramos) {
    if (t < tr.a) return acum;
    if (t <= tr.b) return acum + (t - tr.a);
    acum += tr.b - tr.a;
  }
  return acum;
}

export const duracionEditada = (tramos: Tramo[]) => tramos.reduce((s, t) => s + (t.b - t.a), 0);

/**
 * Subtítulos con tiempos del video editado. Cada uno arranca cuando se dice su
 * primera palabra y dura hasta que empieza el siguiente (el último, hasta el final).
 */
export function cuesEditados(cuesIA: CueIA[], palabras: Palabra[], tramos: Tramo[]): Cue[] {
  const total = duracionEditada(tramos);
  const validos = cuesIA
    .filter((c) => Number.isInteger(c.desde) && palabras[c.desde] && typeof c.es === 'string' && c.es.trim())
    .sort((x, y) => x.desde - y.desde);
  const cues: Cue[] = [];
  validos.forEach((c, i) => {
    const t0 = Math.max(0, mapear(palabras[c.desde].s, tramos) - 0.03);
    const sig = validos[i + 1];
    const t1 = sig ? Math.max(t0 + 0.3, mapear(palabras[sig.desde].s, tramos) - 0.03) : total;
    const es = c.es.trim().replace(/\s+/g, ' ');
    const clave = typeof c.clave === 'string' && es.toLowerCase().includes(c.clave.trim().toLowerCase()) ? c.clave.trim() : '';
    cues.push({ t0, t1: Math.min(t1, total), es, clave });
  });
  return cues.filter((c) => c.t1 - c.t0 > 0.12);
}

/* ---------- Subtítulos en formato ASS (los dibuja ffmpeg) ---------- */

export const tiempoAss = (t: number) => {
  const cs = Math.max(0, Math.round(t * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
};
/** Llaves y barras del texto no pueden pasar como órdenes de formato. */
export const limpiarAss = (s: string) => s.replace(/[{}\\]/g, '').replace(/\n/g, ' ');

/** Color #rrggbb → formato ASS &H00BBGGRR&. */
export const colorAss = (hex: string) => `&H00${hex.slice(5, 7)}${hex.slice(3, 5)}${hex.slice(1, 3)}&`.toUpperCase();

export const COLOR_CLAVE = '#ff5fa2';

/**
 * Archivo .ass para un video de ancho × alto. Una línea por subtítulo (Inter
 * ExtraBold blanca con borde oscuro) a ≈ 68 % de la altura, la palabra clave en
 * Bricolage rosa y un poco más grande, con un latido cuando aparece.
 */
export function archivoAss(cues: Cue[], ancho: number, alto: number): string {
  // En ASS el tamaño cuenta el alto total de la letra (ascendente + descendente):
  // ×1,21 para que se vea como Inter 74 / Bricolage 86 de la edición a mano.
  const k = (Math.min(ancho, alto) / 1080) * 1.21;
  const base = Math.round(74 * k);
  const grande = Math.round(86 * k);
  const borde = Math.max(2, Math.round(6 * (k / 1.21)));
  const margenV = Math.round(alto * 0.3);
  const lineas = cues.map((c) => {
    // Si la frase es larga, se achica para que entre en una línea.
    const lim = 20;
    const f = c.es.length > lim ? lim / c.es.length : 1;
    const fs = Math.round(base * Math.max(0.6, f));
    const fsK = Math.round(grande * Math.max(0.6, f));
    let cuerpo = limpiarAss(c.es);
    if (c.clave) {
      const i = cuerpo.toLowerCase().indexOf(c.clave.toLowerCase());
      if (i >= 0) {
        const pal = cuerpo.slice(i, i + c.clave.length);
        cuerpo = `${cuerpo.slice(0, i)}{\\fnBricolage Grotesque ExtraBold\\fs${fsK}\\c${colorAss(COLOR_CLAVE)}\\t(40,160,\\fscx110\\fscy110)\\t(160,300,\\fscx100\\fscy100)}${limpiarAss(pal)}{\\fnInter ExtraBold\\fs${fs}\\c&H00FFFFFF&\\fscx100\\fscy100}${cuerpo.slice(i + c.clave.length)}`;
      }
    }
    return `Dialogue: 0,${tiempoAss(c.t0)},${tiempoAss(c.t1)},Sub,,0,0,0,,{\\fad(60,0)\\fs${fs}}${cuerpo}`;
  });
  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${ancho}`,
    `PlayResY: ${alto}`,
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Sub,Inter ExtraBold,${base},&H00FFFFFF,&H00FFFFFF,&H00141D1D,&H80000000,0,0,0,0,100,100,0,0,1,${borde},${Math.max(1, Math.round(3 * k))},2,30,30,${margenV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...lineas,
    '',
  ].join('\n');
}

/* ---------- Corte con ffmpeg ---------- */

/**
 * Filtro de ffmpeg: corta los tramos (video y audio juntos, con fundidos de
 * 12 ms para que no haga "clic"), alterna un acercamiento de 1,07 en cada corte
 * (así el salto parece a propósito), agranda a `ancho`×`alto`, dibuja los
 * subtítulos y trata la voz.
 */
export function filtroFfmpeg(tramos: Tramo[], ancho: number, alto: number, archivoSubs: string, carpetaFuentes: string): string {
  const esc = (p: string) => p.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
  const partes: string[] = [];
  tramos.forEach((t, i) => {
    const zoom = i % 2 === 1 ? ',scale=trunc(iw*1.07/2)*2:trunc(ih*1.07/2)*2,crop=trunc(iw/1.07/2)*2:trunc(ih/1.07/2)*2:(iw-ow)/2:(ih-oh)*0.4' : '';
    const d = (t.b - t.a).toFixed(3);
    partes.push(`[0:v]trim=start=${t.a.toFixed(3)}:end=${t.b.toFixed(3)},setpts=PTS-STARTPTS${zoom},scale=${ancho}:${alto}:flags=lanczos,setsar=1[v${i}]`);
    partes.push(`[0:a]atrim=start=${t.a.toFixed(3)}:end=${t.b.toFixed(3)},asetpts=PTS-STARTPTS,afade=t=in:d=0.012,afade=t=out:st=${Math.max(0, Number(d) - 0.012).toFixed(3)}:d=0.012[a${i}]`);
  });
  partes.push(`${tramos.map((_, i) => `[v${i}][a${i}]`).join('')}concat=n=${tramos.length}:v=1:a=1[vc][ac]`);
  partes.push(`[vc]unsharp=5:5:0.55:5:5:0,ass='${esc(archivoSubs)}':fontsdir='${esc(carpetaFuentes)}',format=yuv420p[vout]`);
  partes.push('[ac]highpass=f=80,acompressor=threshold=-20dB:ratio=3:attack=5:release=80,loudnorm=I=-16:TP=-1.5:LRA=7,aresample=48000[aout]');
  return partes.join(';\n');
}

/** Medidas de salida: el lado corto a 1080 (sin achicar nunca el original), siempre pares. */
export function medidasSalida(w: number, h: number): { ancho: number; alto: number } {
  // Casi 9:16 o 16:9 (Seedance da 480×854): se usa el formato exacto.
  if (w < h && Math.abs(w / h - 9 / 16) < 0.01 && w <= 1080) return { ancho: 1080, alto: 1920 };
  if (w > h && Math.abs(h / w - 9 / 16) < 0.01 && h <= 1080) return { ancho: 1920, alto: 1080 };
  const k = Math.max(1, 1080 / Math.min(w, h));
  return { ancho: Math.round((w * k) / 2) * 2, alto: Math.round((h * k) / 2) * 2 };
}
