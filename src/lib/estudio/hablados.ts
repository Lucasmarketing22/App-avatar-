import { describirCuerpo, medidasDe } from './prompt';

/**
 * "Hablados": videos de la modelo hablando a cámara, casual y creíble.
 * No es una foto animada: el motor genera el video entero (boca, gestos, voz y
 * sonido juntos) a partir de la foto inicial. El prompt sigue el método de
 * realismo CyberJungle: quién graba y con qué, microgestos con motivo, pausas
 * entre frases, luz real del lugar y sonido de micrófono de celular.
 */

export type Motor = 'kling3' | 'omni';

export const ESCENARIOS: { id: string; label: string; en: string }[] = [
  { id: 'sillon', label: '🛋️ Sillón', en: 'sitting sideways on a beige fabric sofa in a lived-in living room, a window at camera-left, a few cushions and a throw blanket' },
  { id: 'cama', label: '🛏️ Cama', en: 'sitting cross-legged on her unmade bed in a cozy bedroom, soft daylight from a window at camera-left, a nightstand lamp off in the background' },
  { id: 'auto', label: '🚗 Auto', en: 'sitting in the driver seat of her parked car, seatbelt off, daylight through the windshield and side window, the street softly visible outside' },
  { id: 'cocina', label: '🍳 Cocina', en: 'sitting on a stool at her kitchen counter, a mug beside her hand, daylight from a window behind the counter at camera-left' },
  { id: 'cafe', label: '☕ Café', en: 'sitting at a small table in a quiet café, a cup in front of her, window light from camera-left, a couple of customers far in the background' },
  { id: 'escritorio', label: '💻 Escritorio', en: 'sitting at her desk at home, a laptop half-closed beside her, a window at camera-left, a plant and a few books in the background' },
];

export const GRABACIONES: { id: string; label: string; en: string }[] = [
  { id: 'apoyado', label: '📱 Celular apoyado', en: 'Her phone is propped up on a surface in front of her at chest height, about one metre away, recording with the front camera; the frame stays fixed with only tiny vibrations when she touches the surface' },
  { id: 'selfie', label: '🤳 Selfie en mano', en: 'She holds the phone herself at arm\'s length with one hand (front camera, slightly above eye level); small breathing-driven movements and subtle wrist drift, one late reframing when she moves, then it settles. Only her other hand is free' },
  { id: 'amiga', label: '👭 La filma alguien', en: 'A friend seated opposite records with the phone\'s rear camera at chest height, about one metre away; slightly off-center framing, small handheld breathing movements' },
];

export const ESTILOS: { id: string; label: string; desc: string }[] = [
  { id: 'storytime', label: 'Storytime / confesión', desc: 'Cuenta algo que le pasó, como un secreto entre amigas.' },
  { id: 'opinion', label: 'Opinión que genera debate', desc: 'Una postura clara que invita a comentar.' },
  { id: 'consejo', label: 'Consejo rápido', desc: 'Un tip útil y concreto, dicho con naturalidad.' },
];

/** Duración que acepta cada motor: Kling 3.0 de 3 a 15 s; Gemini Omni 4, 6, 8 o 10 s. */
export function durValida(motor: Motor, d: number): number {
  const n = Math.round(Number(d) || 10);
  if (motor === 'omni') return [4, 6, 8, 10].reduce((a, x) => (Math.abs(x - Math.min(10, n)) < Math.abs(a - Math.min(10, n)) ? x : a), 10);
  return Math.min(15, Math.max(3, n));
}

/** Voces del catálogo de Gemini Omni (solo femeninas). */
export const VOCES_OMNI: { id: string; label: string }[] = [
  { id: 'callirrhoe', label: 'Relajada' },
  { id: 'leda', label: 'Joven' },
  { id: 'zephyr', label: 'Luminosa' },
  { id: 'sulafat', label: 'Cálida' },
  { id: 'aoede', label: 'Enérgica' },
  { id: 'despina', label: 'Suave' },
];

export const IDIOMA_DEFECTO = 'Inglés de Estados Unidos, casual, como hablándole a una amiga';

/** Cuántas palabras entran en el video sin apurarla (deja lugar a pausas y respiraciones). */
export function palabrasMax(dur: number): number {
  return Math.max(8, Math.round(dur * 2.3) - 3);
}

export type Guion = {
  estilo: string;
  titulo: string;
  gancho: string;
  desarrollo: string;
  cierre: string;
  /** Lo que dice, completo y en el idioma elegido. */
  texto: string;
  /** Microgestos y acciones (en inglés, van directo al prompt del video). */
  gestos: string;
  /** Texto para publicar (en el idioma elegido). */
  caption: string;
  /** Lo que dice, traducido al español (para entender qué va a decir). */
  traduccion: string;
};

/** Pista para la foto inicial: ella sentada en el escenario, con encuadre de celular. */
export function pistaFotoInicial(escenario: string, grabacion: string): string {
  const g = GRABACIONES.find((x) => x.id === grabacion) ?? GRABACIONES[0];
  const encuadre = g.id === 'selfie'
    ? 'Front-camera selfie framing from arm\'s length, slightly above eye level, vertical 9:16: her face in the upper third and her upper body visible down to the waist, one arm extended toward the camera (the phone itself is not visible).'
    : 'Vertical 9:16 phone framing from about one metre away at chest height: head, shoulders and hands visible, slightly off-center, she looks into the lens as if about to talk to a friend.';
  return [
    `She is ${escenario.trim()}.`,
    encuadre,
    'Relaxed, natural posture, mouth closed or slightly parted, an ordinary candid moment right before she starts talking. Her own figure (as described) is clearly recognizable in the frame. Real, lived-in place with motivated natural light.',
  ].join(' ');
}

/**
 * Prompt del video, armado con la estructura de CyberJungle:
 * formato → sujeto → lugar y luz → cámara → acción → diálogo y sonido → límites.
 * Kling: `@mila` es el elemento con sus fotos y su muestra de voz.
 * Omni: la imagen 1 es el primer cuadro y las demás, su cara.
 */
export function componerVideoHablado(o: {
  motor: Motor;
  dur: number;
  texto: string;
  idioma: string;
  escenario: string;
  grabacion: string;
  gestos?: string;
  fijo?: string;
  cuerpo?: string;
}): string {
  const g = GRABACIONES.find((x) => x.id === o.grabacion) ?? GRABACIONES[0];
  const ella = o.motor === 'kling3' ? '@mila' : 'the woman';
  const sujeto = o.motor === 'kling3'
    ? 'SUBJECT: @mila — the same woman as the first frame: identical face, freckles, eye color, hair and outfit. Keep her identity stable through every movement.'
    : 'SUBJECT: the woman of Image 1 (the exact opening frame: same place, outfit, framing and light). The other images show her face: keep her identity identical (face, freckles, eye color, hair).';
  const voz = o.motor === 'kling3' ? ' in @mila\'s own voice (match the timbre, accent and pace of her voice sample)' : '';
  const fijo = (o.fijo ?? '').trim();
  const partes = [
    `FORMAT: ${o.dur}-second, 9:16 live-action personal phone video. One continuous take, no cuts. Contemporary phone footage, beauty mode off.`,
    sujeto,
    fijo ? `Her fixed traits: ${fijo.slice(0, 300)}` : '',
    medidasDe(o.cuerpo, o.fijo) ? `BODY: keep exactly the figure of the first frame (${describirCuerpo(medidasDe(o.cuerpo, o.fijo))}) in every movement.` : '',
    `SETTING / LIGHT: ${o.escenario.trim()}. Motivated natural light from the window; light direction stays consistent.`,
    `CAMERA: ${g.en}.`,
    `ACTION: An unguarded, unperformed moment. ${ella} talks to the camera as if to a close friend, not presenting. Micro-gestures with a reason: a brief glance away while she thinks, eyebrows lifting on the key word, a small exhale or soft laugh, a hand that moves naturally once and rests again. Natural blinking, a quiet breath before the first word.${o.gestos ? ` ${o.gestos.trim().slice(0, 400)}` : ''}`,
    `DIALOGUE: ${ella} speaks in the language and accent described as "${o.idioma.trim()}"${voz}, conversational delivery with natural pauses between phrases (do not rush, leave a short silence where it fits): "${o.texto.trim()}"`,
    'AUDIO: phone-microphone perspective, close natural voice with faint room reflections, quiet room tone. No music, no narration, no sound effects added in post.',
    'SKIN: visible pores, natural skin-color variation, freckles stable through movement, a few flyaways catching the light; mostly matte cheeks.',
    'CONSTRAINTS: no beauty smoothing, no waxy skin, no forced presenter smile, no repeated gestures on a loop, no exaggerated camera shake, no subtitles or text on screen, no extra people talking, no morphing fingers. Keep her face, outfit and the place consistent.',
  ];
  return partes.filter(Boolean).join('\n').slice(0, 2500);
}

/** Pedido a la IA de texto para los 3 guiones (estilo Estratega AvatarHype). */
export function pedidoGuiones(o: { tema: string; idioma: string; dur: number; nombre: string; escenario: string; extra?: string }): string {
  const max = palabrasMax(o.dur);
  return [
    `You write short talking-to-camera scripts for ${o.nombre || 'an AI influencer'}, a young woman who posts casual selfie videos on TikTok and Instagram Reels.`,
    `Topic / idea: ${o.tema.trim()}`,
    o.extra?.trim() ? `Extra notes from the creator: ${o.extra.trim()}` : '',
    `Language and tone for everything she SAYS: ${o.idioma.trim()}. Write the spoken lines natively in that language (not translated-sounding), with natural contractions and filler words a real person would use.`,
    `The video lasts ${o.dur} seconds, so the full spoken text must be at most ${max} words (fewer is better: she needs room for pauses and breaths).`,
    `She is ${o.escenario.trim()}.`,
    'Write exactly 3 scripts, one per style:',
    '1. "storytime": a confession or something that happened to her, told like a secret to a friend.',
    '2. "opinion": a clear, slightly polarizing take that makes people want to comment.',
    '3. "consejo": one quick, concrete, useful tip.',
    'Each script needs: a hook that stops the scroll in the first 2 seconds (curiosity, tension or a bold statement — never "Hi guys" or a greeting), a short development, and a closing line that invites a comment or a follow (soft, not salesy).',
    'Also write "gestos": 1-2 short sentences IN ENGLISH with the micro-gestures and small actions that fit the script (e.g. "She glances away and laughs softly before the hook, then leans in slightly on the key line"). Keep them subtle and motivated.',
    'And "caption": a short post caption in the same language as the spoken text, with 3-5 relevant hashtags.',
    'And "traduccion": a faithful translation into Rioplatense Spanish (Argentina) of the full spoken text ("texto"), so the creator understands exactly what she says.',
    'Nothing explicit, no medical/financial claims, no mention of being AI.',
    'Answer by calling the tool entregar_guiones.',
  ].filter(Boolean).join('\n');
}

/** Lee la respuesta de la IA de texto y la deja en 3 guiones válidos. */
export function limpiarGuiones(x: unknown): Guion[] {
  const lista = Array.isArray((x as { guiones?: unknown })?.guiones) ? (x as { guiones: unknown[] }).guiones : Array.isArray(x) ? x : [];
  const s = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
  return lista.slice(0, 3).map((g) => {
    const o = (g ?? {}) as Record<string, unknown>;
    const gancho = s(o.gancho, 300), desarrollo = s(o.desarrollo, 600), cierre = s(o.cierre, 300);
    return {
      estilo: s(o.estilo, 30),
      titulo: s(o.titulo, 80),
      gancho, desarrollo, cierre,
      texto: s(o.texto, 900) || [gancho, desarrollo, cierre].filter(Boolean).join(' '),
      gestos: s(o.gestos, 400),
      caption: s(o.caption, 400),
      traduccion: s(o.traduccion, 1200),
    };
  }).filter((g) => g.texto);
}
