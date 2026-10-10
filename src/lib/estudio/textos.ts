/**
 * Textos para publicar (descripción + hashtags), sin IA: plantillas en
 * castellano rioplatense según la escena de la foto/video. Al instante y
 * sin gastar créditos; se pueden editar antes de compartir.
 */

export type Red = 'instagram' | 'tiktok';

type Escena = { clave: string; palabras: RegExp; textos: string[]; tags: string[] };

const ESCENAS: Escena[] = [
  {
    clave: 'playa',
    palabras: /beach|playa|bikini|ocean|sea\b|mar\b|sand|arena|swimsuit|malla|pool|pileta|piscina/i,
    textos: [
      'Sol, mar y cero apuro 🌊☀️',
      'Modo verano activado y no pienso desactivarlo 👙',
      'Si me buscás, estoy acá tomando sol 🌞',
      'Mi lugar favorito tiene arena y olor a mar 🐚',
      'El verano me queda bien, ¿o no? 😏',
    ],
    tags: ['#playa', '#verano', '#beachvibes', '#summer', '#bikini'],
  },
  {
    clave: 'cama',
    palabras: /\bbed\b|bedroom|cama|sheets|sábanas|pillow|almohada|lazy morning|mañana/i,
    textos: [
      'Domingo de no salir de la cama 🤍',
      '5 minutitos más… o 50 😴',
      'Buen día para los que ya me extrañaban ☕️',
      'Hoy el plan es no tener plan 🛏️',
      'Despertarse así no está nada mal, ¿no? 😌',
    ],
    tags: ['#goodmorning', '#lazyday', '#cozy', '#buendia', '#domingo'],
  },
  {
    clave: 'noche',
    palabras: /night|noche|club|party|fiesta|bar\b|neon|dinner|cena|evening/i,
    textos: [
      'La noche recién empieza ✨',
      'Lista para salir… ¿quién se suma? 🍸',
      'De noche me pongo más linda, dicen 🌙',
      'Plan de hoy: brillar 💫',
      'Outfit elegido, ahora falta la compañía 😏',
    ],
    tags: ['#nightout', '#noche', '#outfit', '#party', '#glam'],
  },
  {
    clave: 'gym',
    palabras: /gym|fitness|workout|entren|yoga|sport|deportiv|leggings|calzas|running/i,
    textos: [
      'Entrenar también es quererse 💪',
      'Hoy no se negocia: se entrena 🔥',
      'Sudar un poco para sentirme mejor 🏋️‍♀️',
      'Constancia > motivación ✨',
    ],
    tags: ['#gym', '#fitness', '#fitgirl', '#workout', '#entrenamiento'],
  },
  {
    clave: 'ciudad',
    palabras: /street|calle|city|ciudad|urban|downtown|café|cafe|coffee|caf[eé]teria|shopping|paseo/i,
    textos: [
      'Perdida por la ciudad (a propósito) 🏙️',
      'Un café, una caminata y buena música ☕️',
      'Paseando sin rumbo, como más me gusta 🚶‍♀️',
      'La ciudad tiene otro color cuando salgo yo 😌',
    ],
    tags: ['#citygirl', '#streetstyle', '#coffee', '#ootd', '#buenosaires'],
  },
  {
    clave: 'espejo',
    palabras: /mirror|espejo|selfie/i,
    textos: [
      'Selfie de rutina, porque sí 🤳',
      'El espejo y yo nos llevamos bien hoy ✨',
      'Foto rápida antes de salir 📸',
    ],
    tags: ['#selfie', '#mirrorselfie', '#ootd', '#selfielove'],
  },
];

const GENERALES = [
  'Hoy me levanté así ✨',
  'Un poquito de mí para tu feed 💋',
  '¿Me extrañaste? 😏',
  'Pelirroja y con ganas de todo 🔥',
  'No es casualidad, es actitud 💅',
  'Guardá esta foto para cuando necesites alegrarte el día 😌',
  'Contame algo lindo en los comentarios 👇',
  'Así arranca mi día, ¿y el tuyo? ☀️',
];

const CIERRES = ['', '', '¿Qué te parece? 👇', 'Contame en los comentarios 💬', 'Dale ❤️ si te gustó', 'Seguime para más 💋'];

const BASE_TAGS = ['#pelirroja', '#redhead', '#argentina', '#modelo', '#instagood', '#fotodeldia', '#ginger', '#freckles'];

function escenaDe(prompt: string): Escena | null {
  return ESCENAS.find((e) => e.palabras.test(prompt)) ?? null;
}

/**
 * Arma el texto para publicar. `n` cambia la variante (botón "Otro texto").
 * `ia` agrega #ia/#aiinfluencer (Instagram y TikTok piden avisar el contenido de IA).
 */
export function armarTexto(opts: { prompt?: string; n: number; red: Red; ia: boolean; nombre?: string }): string {
  const esc = escenaDe(opts.prompt ?? '');
  const lista = esc ? [...esc.textos, ...GENERALES.slice(0, 3)] : GENERALES;
  const n = Math.abs(opts.n);
  const frase = lista[n % lista.length];
  const cierre = CIERRES[(n * 7 + 3) % CIERRES.length];

  const propios = esc ? esc.tags : [];
  const nombreTag = opts.nombre ? `#${opts.nombre.toLowerCase().replace(/[^a-z0-9ñáéíóú]/gi, '')}` : '';
  const iaTags = opts.ia ? ['#ia', '#aiinfluencer'] : [];
  // Instagram rinde con más hashtags; TikTok con pocos.
  const max = opts.red === 'instagram' ? 14 : 5;
  const rotados = [...BASE_TAGS.slice(n % BASE_TAGS.length), ...BASE_TAGS.slice(0, n % BASE_TAGS.length)];
  const tags = Array.from(new Set([
    ...(opts.red === 'tiktok' ? ['#fyp'] : []),
    ...propios.slice(0, opts.red === 'tiktok' ? 2 : 5),
    ...(nombreTag.length > 1 ? [nombreTag] : []),
    ...iaTags,
    ...rotados,
  ]));

  return [frase, cierre].filter(Boolean).join(' ') + '\n\n' + tags.slice(0, max).join(' ');
}
