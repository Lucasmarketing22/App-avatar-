/**
 * Edición automática, estilo "Pro / Llamativo" (sin servicios: solo arma lo
 * que necesita ffmpeg). Sobre los mismos cortes que el estilo natural agrega:
 *  - captions de 1–3 palabras que entran de borroso a nítido con rebote, la
 *    palabra clave en amarillo con brillo, y un emoji 3D que salta con ella;
 *  - gancho: zoom-out rápido en el primer medio segundo;
 *  - movimiento: acercamientos alternados en cada corte, un empuje lento y un
 *    golpe de zoom en las palabras clave;
 *  - transiciones: barrido con desenfoque + destello en los cortes grandes
 *    (y un glitch sutil en el primero);
 *  - sonido sutil sincronizado (whoosh en los cortes, pop con los emojis,
 *    brillo con el logo, "ding" al final);
 *  - color un poco más vivo y viñeta suave;
 *  - cierre de ~3 s: foto del producto, marca con brillo, 3 beneficios y CTA.
 */
import path from 'node:path';

import { colorAss, duracionEditada, limpiarAss, mapear, tiempoAss, type Palabra, type Tramo } from '@/lib/edicion/plan';

/** Capas del estilo Pro que se pueden apagar. */
export type Capas = { emojis: boolean; sonidos: boolean; movimiento: boolean; color: boolean };

export type ChunkIA = { desde: number; hasta: number; es: string; clave?: string; emoji?: string };
export type Cierre = {
  foto: string;
  /** Medidas de la foto y el color de su borde de arriba (#rrggbb), para el fondo. */
  fotoAncho: number;
  fotoAlto: number;
  fondo: string;
  marca?: string;
  beneficios?: string[];
  cta?: string;
  color?: string;
};

/** Emojis 3D disponibles (assets/emojis/<nombre>.png, Fluent Emoji de Microsoft, MIT). */
export const EMOJIS = [
  'stop', 'explota', 'robot', 'sol', 'corazon-blanco', 'pluma', 'gota', 'brillos', 'check', 'fuego', 'ojos', 'grito', 'cien',
  'enamorada', 'plata', 'regalo', 'corazon', 'manos', 'fuerza', 'senala', 'compras', 'paquete', 'rayo', 'diamante', 'boom',
  'canchero', 'secreto', 'pensando', 'fiesta', 'estrella', 'reloj',
] as const;

const W = 1080;
const H = 1920;
const AMARILLO = '#ffd43b';
const Y_CAPTION = 1250;
const CIERRE_S = 3.4;

type Sfx = { archivo: string; t: number; db: number; corte?: number };
type Emoji = { archivo: string; t0: number; t1: number; x: number; y: number; tam: number };

export type PlanPro = {
  /** Entradas de ffmpeg después del video (en orden: foto del cierre, emojis, sonidos). */
  entradas: string[][];
  filtro: string;
  ass: string;
  duracion: number;
};

const f3 = (n: number) => n.toFixed(3);

/** Una línea de caption: texto con la palabra clave resaltada (y su capa de brillo). */
function lineaCaption(es: string, clave: string, fs: number, brillo: boolean): string {
  const t = limpiarAss(es);
  const i = clave ? t.toLowerCase().indexOf(clave.toLowerCase()) : -1;
  const fsK = Math.round(fs * 1.16);
  const invisible = '\\1a&HFF&\\3a&HFF&\\4a&HFF&';
  if (i < 0) return brillo ? '' : t;
  const antes = t.slice(0, i);
  const k = t.slice(i, i + clave.length);
  const despues = t.slice(i + clave.length);
  if (brillo) {
    // Misma línea, todo invisible salvo un halo amarillo detrás de la palabra clave.
    return `{${invisible}}${antes}{\\fs${fsK}\\3c${colorAss(AMARILLO)}\\3a&H50&\\bord16\\blur14}${k}{\\fs${fs}${invisible}\\bord0}${despues}`;
  }
  return `${antes}{\\fs${fsK}\\c${colorAss(AMARILLO)}}${k}{\\fs${fs}\\c&HFFFFFF&}${despues}`;
}

export function planPro(o: {
  palabras: Palabra[];
  tramos: Tramo[];
  chunks: ChunkIA[];
  carpetaEmojis: string;
  carpetaSfx: string;
  /** Cuándo empieza de verdad a sonar la voz en el original (medido en el audio; los tiempos de Whisper pueden adelantarse). */
  inicioVoz?: number;
  /** Índice de la primera entrada extra en el comando de ffmpeg (la 0 es el video). */
  primeraEntrada?: number;
  cierre?: Cierre;
  /** Capas que se pueden apagar (por defecto, todas prendidas). */
  capas?: Partial<Capas>;
}): PlanPro {
  const { palabras, tramos } = o;
  const capas: Capas = { emojis: true, sonidos: true, movimiento: true, color: true, ...o.capas };
  // La primera palabra necesita aire (≥ 0,3 s): si la modelo habla desde el primer cuadro,
  // se congela ese cuadro un instante (en el celular el sonido tarda y se come el arranque).
  const primera = Math.max(palabras[0]?.s ?? 0, o.inicioVoz ?? 0);
  const aire = palabras.length && tramos.length ? Math.max(0, 0.3 - (primera - tramos[0].a)) : 0;
  const AIRE = aire > 0.05 ? aire : 0;
  const mapa = (t: number) => AIRE + mapear(t, tramos);
  const D = AIRE + duracionEditada(tramos);
  const C = o.cierre ? CIERRE_S : 0;
  const T = D + C;
  const entradas: string[][] = [];
  let siguiente = o.primeraEntrada ?? 1;
  const entrada = (args: string[]) => { entradas.push(args); return siguiente++; };

  /* ----- Captions ----- */
  const validos = o.chunks
    .filter((c) => Number.isInteger(c.desde) && palabras[c.desde] && typeof c.es === 'string' && c.es.trim())
    .sort((a, b) => a.desde - b.desde);
  const caps = validos.map((c, i) => {
    const t0 = Math.max(0, mapa(palabras[c.desde].s) - 0.03);
    const sig = validos[i + 1];
    const t1 = sig ? Math.max(t0 + 0.25, mapa(palabras[sig.desde].s) - 0.03) : D;
    const es = c.es.trim().replace(/\s+/g, ' ');
    const clave = typeof c.clave === 'string' && es.toLowerCase().includes(c.clave.trim().toLowerCase()) ? c.clave.trim() : '';
    const emoji = capas.emojis && typeof c.emoji === 'string' && (EMOJIS as readonly string[]).includes(c.emoji) ? c.emoji : '';
    return { t0, t1: Math.min(t1, D), es, clave, emoji };
  }).filter((c) => c.t1 - c.t0 > 0.1);

  const GIROS = [-2, 1.5, -1, 2, 0];
  const eventos: string[] = [];
  caps.forEach((c, i) => {
    const base = i === 0 ? 150 : 118; // el gancho, más grande
    const fs = Math.round(base * Math.min(1, 15 / Math.max(15, c.es.length)));
    const anim = `\\an5\\pos(${W / 2},${Y_CAPTION})\\fad(30,50)\\blur8\\t(0,110,\\blur0)\\fscx70\\fscy70\\t(0,100,\\fscx112\\fscy112)\\t(100,190,\\fscx100\\fscy100)\\frz${GIROS[i % GIROS.length]}\\fs${fs}`;
    const ini = tiempoAss(c.t0);
    const fin = tiempoAss(c.t1);
    if (c.clave) eventos.push(`Dialogue: 0,${ini},${fin},Cap,,0,0,0,,{${anim}}${lineaCaption(c.es, c.clave, fs, true)}`);
    eventos.push(`Dialogue: 1,${ini},${fin},Cap,,0,0,0,,{${anim}}${lineaCaption(c.es, c.clave, fs, false)}`);
  });

  /* ----- Emojis ----- */
  // Al costado del texto (arriba tapaba lo que se muestra: la crema en la cara, el producto), sin pasar
  // x = 900: más a la derecha quedan los botones de TikTok / Reels. Ancho del texto ≈ 0,4 × tamaño por letra
  // (medido en Inter ExtraBold). Si no entra al costado, va arriba a la derecha del final del texto.
  const emojis: Emoji[] = caps.filter((c) => c.emoji).map((c, i) => {
    const fs = (i === 0 ? 150 : 118) * Math.min(1, 15 / Math.max(15, c.es.length));
    const ancho = c.es.length * fs * 0.4;
    const archivo = path.join(o.carpetaEmojis, `${c.emoji}.png`);
    const x = W / 2 + ancho / 2 + 75;
    return x <= 900
      ? { archivo, t0: c.t0 + 0.02, t1: c.t1, x, y: Y_CAPTION - 55, tam: 150 }
      : { archivo, t0: c.t0 + 0.02, t1: c.t1, x: Math.min(900, W / 2 + ancho / 2 - 20), y: Y_CAPTION - 140, tam: 130 };
  });

  /* ----- Sonido ----- */
  // Volúmenes pensados para que se escuchen con la voz y con la música que se agrega después.
  const sfx: Sfx[] = [{ archivo: 'whoosh-short.mp3', t: 0, db: -9 }];
  caps.forEach((c) => { if (c.emoji) sfx.push({ archivo: 'pop.mp3', t: c.t0, db: -10 }); });

  /* ----- Video: tramos con zoom, transiciones y color ----- */
  const partes: string[] = [];
  let acum = AIRE;
  let glitchUsado = false;
  tramos.forEach((tr, i) => {
    const d = tr.b - tr.a;
    const hueco = i > 0 ? tr.a - tramos[i - 1].b : 0;
    const grande = i > 0 && hueco > 0.4;
    // Golpe de zoom (+5 %) cuando aparece una palabra clave con emoji dentro de este tramo.
    const ini = i === 0 ? 0 : acum; // el tramo 0 incluye el cuadro congelado
    const largo = i === 0 ? d + AIRE : d;
    const golpes = caps.filter((c) => c.emoji && c.t0 >= ini && c.t0 < ini + largo).map((c) => c.t0 - ini);
    const golpe = !capas.movimiento ? '' : golpes.map((g) => `+0.05*exp(-pow((t-${f3(g)})/0.12,2))`).join('');
    const base = !capas.movimiento ? '1' : i === 0 ? `1+0.16*pow(max(0,1-t/0.5),2)` : i % 2 ? '1.08' : '1';
    const z = `${base}+0.03*t/${f3(largo)}${golpe}`;
    let fx = '';
    if (grande && capas.movimiento) {
      fx += `,avgblur=sizeX=30:sizeY=1:enable='lt(t,0.09)',eq=brightness=0.10:enable='lt(t,0.05)'`;
      if (!glitchUsado) { fx += `,rgbashift=rh=-10:bh=10:enable='lt(t,0.1)'`; glitchUsado = true; }
      sfx.push({ archivo: 'whoosh-short.mp3', t: Math.max(0, acum - 0.06), db: -10 });
    }
    const pausa = i === 0 && AIRE ? `,tpad=start_duration=${f3(AIRE)}:start_mode=clone` : '';
    const pausaA = i === 0 && AIRE ? `,adelay=${Math.round(AIRE * 1000)}|${Math.round(AIRE * 1000)}` : '';
    partes.push(`[0:v]trim=start=${f3(tr.a)}:end=${f3(tr.b)},setpts=PTS-STARTPTS,fps=30${pausa},scale=${W}:${H}:flags=lanczos,setsar=1,scale=w='trunc(${W}*(${z})/2)*2':h=-2:eval=frame:flags=bicubic,crop=${W}:${H}:(iw-${W})/2:(ih-${H})*0.42,setsar=1${fx}[v${i}]`);
    partes.push(`[0:a]atrim=start=${f3(tr.a)}:end=${f3(tr.b)},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,afade=t=in:d=0.012,afade=t=out:st=${f3(Math.max(0, d - 0.012))}:d=0.012${pausaA}[a${i}]`);
    acum += d;
  });

  /* ----- Cierre ----- */
  let pares = tramos.map((_, i) => `[v${i}][a${i}]`).join('');
  if (o.cierre) {
    const ci = o.cierre;
    const foto = entrada(['-loop', '1', '-framerate', '30', '-t', f3(C), '-i', ci.foto]);
    // Fondo liso del color de la foto; la foto entera arriba (hasta y≈1200), con los bordes difuminados para que
    // se funda con el fondo (en fotos de estudio no se nota dónde termina). Abajo, los textos, por encima de
    // y≈1700: más abajo los tapan la descripción y los botones de TikTok / Reels.
    // (Probado y descartado: tarjeta sobre la misma foto desenfocada → se veían los bordes; estirar el borde de
    // abajo → si ahí estaba el producto, quedaba una franja.) Entra con un pequeño rebote y se acerca despacio.
    const k = Math.min(W / ci.fotoAncho, 1120 / ci.fotoAlto);
    const fw = Math.round((ci.fotoAncho * k) / 2) * 2;
    const fh = Math.round((ci.fotoAlto * k) / 2) * 2;
    const fy = Math.max(0, Math.round((1200 - fh) / 2));
    const borde = Math.round(Math.min(fw, fh) * 0.08);
    const ef = `if(lt(t,0.15),1.12-0.8*t,1.0+0.05*(t-0.15)/${f3(C)})`;
    partes.push(`[${foto}:v]scale=${fw}:${fh},setsar=1,format=rgba[cfi]`);
    partes.push(`color=c=black:s=${fw}x${fh}:d=0.04,format=gray,geq=lum='255*min(1,min(min(X,W-1-X),min(Y,H-1-Y))/${borde})',loop=loop=-1:size=1,trim=duration=${f3(C)}[cmask]`);
    partes.push(`[cfi][cmask]alphamerge[cfa]`);
    partes.push(`color=c=${ci.fondo.replace('#', '0x')}:s=${W}x${H}:r=30:d=${f3(C)}[cbg]`);
    partes.push(`[cbg][cfa]overlay=x=${(W - fw) / 2}:y=${fy}:shortest=1,scale=w='trunc(${W}*(${ef})/2)*2':h=-2:eval=frame,crop=${W}:${H}:(iw-${W})/2:(ih-${H})*0.35,format=yuv420p,fps=30,trim=duration=${f3(C)},setpts=PTS-STARTPTS,eq=brightness=0.12:enable='lt(t,0.05)',setsar=1[vend]`);
    partes.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${f3(C)}[aend]`);
    pares += '[vend][aend]';

    const color = colorAss(ci.color ?? '#ff5fa2');
    if (ci.marca) {
      const m = limpiarAss(ci.marca).toUpperCase();
      const anim = `\\an5\\pos(${W / 2},150)\\fscx40\\fscy40\\alpha&HFF&\\t(150,151,\\alpha&H00&)\\t(150,330,\\fscx115\\fscy115)\\t(330,460,\\fscx100\\fscy100)`;
      eventos.push(`Dialogue: 0,${tiempoAss(D)},${tiempoAss(T)},Marca,,0,0,0,,{${anim}\\1a&HFF&\\3c${color}\\3a&H30&\\bord22\\blur18}${m}`);
      eventos.push(`Dialogue: 1,${tiempoAss(D)},${tiempoAss(T)},Marca,,0,0,0,,{${anim}}${m}`);
      sfx.push({ archivo: 'sparkle.mp3', t: D + 0.15, db: -11 });
    }
    (ci.beneficios ?? []).slice(0, 3).forEach((b, i) => {
      const y = 1300 + i * 112;
      const t0 = D + 0.55 + i * 0.28;
      eventos.push(`Dialogue: 1,${tiempoAss(t0)},${tiempoAss(T)},Bullet,,0,0,0,,{\\an4\\move(160,${y},225,${y},0,200)\\fad(140,0)}${limpiarAss(b)}`);
      emojis.push({ archivo: path.join(o.carpetaEmojis, 'check.png'), t0, t1: T, x: 165, y, tam: 84 });
      sfx.push({ archivo: 'click-soft.mp3', t: t0, db: -10 });
    });
    if (ci.cta) {
      const t0 = D + 1.5;
      // Debajo de los beneficios.
      eventos.push(`Dialogue: 1,${tiempoAss(t0)},${tiempoAss(T)},Cta,,0,0,0,,{\\an5\\pos(${W / 2},1650)\\3c${color}\\fscx60\\fscy60\\t(0,140,\\fscx108\\fscy108)\\t(140,240,\\fscx100\\fscy100)}${limpiarAss(ci.cta)}`);
    }
    sfx.push({ archivo: 'whoosh.mp3', t: Math.max(0, D - 0.08), db: -8 });
    sfx.push({ archivo: 'chime.mp3', t: D + 1.55, db: -7 });
  }
  partes.push(`${pares}concat=n=${tramos.length + (o.cierre ? 1 : 0)}:v=1:a=1[vc][ac]`);

  /* ----- Color, captions y emojis encima ----- */
  partes.push(`[vc]${capas.color ? 'eq=contrast=1.06:saturation=1.12,vignette=angle=0.4,' : ''}ass='__ASS__':fontsdir='__FUENTES__'[vs0]`);
  let ultimo = 'vs0';
  emojis.forEach((e, k) => {
    const idx = entrada(['-loop', '1', '-framerate', '30', '-t', f3(e.t1 - e.t0), '-i', e.archivo]);
    const pop = `if(lt(t,0.1),0.4+8*t,if(lt(t,0.2),1.2-2*(t-0.1),1+0.03*sin(6*t)))`;
    partes.push(`[${idx}:v]format=rgba,scale=w='trunc(${e.tam}*(${pop})/2)*2':h=-2:eval=frame,setpts=PTS-STARTPTS+${f3(e.t0)}/TB[e${k}]`);
    partes.push(`[${ultimo}][e${k}]overlay=x='${e.x}-overlay_w/2':y='${e.y}-overlay_h/2':eval=frame:enable='between(t,${f3(e.t0)},${f3(e.t1)})'[vs${k + 1}]`);
    ultimo = `vs${k + 1}`;
  });
  partes.push(`[${ultimo}]format=yuv420p[vout]`);

  /* ----- Audio: voz tratada + efectos sutiles (nunca dos casi juntos) ----- */
  partes.push('[ac]highpass=f=80,acompressor=threshold=-20dB:ratio=3:attack=5:release=80,loudnorm=I=-16:TP=-1.5:LRA=7,aresample=48000[voz]');
  const elegidos = (capas.sonidos ? sfx : []).sort((a, b) => a.t - b.t).filter((s, i, arr) => i === 0 || s.t - arr[i - 1].t > 0.3);
  const mezcla = ['[voz]'];
  elegidos.forEach((s, k) => {
    const idx = entrada(['-i', path.join(o.carpetaSfx, s.archivo)]);
    const ms = Math.round(s.t * 1000);
    partes.push(`[${idx}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${s.db}dB,adelay=${ms}|${ms}[s${k}]`);
    mezcla.push(`[s${k}]`);
  });
  partes.push(`${mezcla.join('')}amix=inputs=${mezcla.length}:normalize=0:duration=first,alimiter=limit=0.95[aout]`);

  const ass = [
    '[Script Info]', 'ScriptType: v4.00+', `PlayResX: ${W}`, `PlayResY: ${H}`, 'WrapStyle: 2', 'ScaledBorderAndShadow: yes', '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    'Style: Cap,Inter ExtraBold,118,&H00FFFFFF,&H00FFFFFF,&H00101010,&H99000000,0,0,0,0,100,100,0,0,1,9,5,5,0,0,0,1',
    'Style: Marca,Bricolage Grotesque ExtraBold,170,&H00FFFFFF,&H00FFFFFF,&H00101010,&H00000000,0,0,0,0,100,100,14,0,1,0,0,5,0,0,0,1',
    'Style: Bullet,Inter ExtraBold,72,&H00FFFFFF,&H00FFFFFF,&H50141010,&H00000000,0,0,0,0,100,100,0,0,3,18,0,4,0,0,0,1',
    'Style: Cta,Inter ExtraBold,90,&H00FFFFFF,&H00FFFFFF,&H00A25FFF,&H00000000,0,0,0,0,100,100,0,0,3,30,0,5,0,0,0,1',
    '', '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...eventos, '',
  ].join('\n');

  return { entradas, filtro: partes.join(';\n'), ass, duracion: T };
}
