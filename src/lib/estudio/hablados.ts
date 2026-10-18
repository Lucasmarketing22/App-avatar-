import { describirCuerpo, medidasDe, pistaCuerpo, pistaFija, pistaFotoCuerpo, REALISMO } from './prompt';

/**
 * "Hablados": videos de la modelo hablando a cámara, casual y creíble.
 * No es una foto animada: el motor genera el video entero (boca, gestos, voz y
 * sonido juntos) a partir de la foto inicial. El prompt sigue el método de
 * realismo CyberJungle: quién graba y con qué, microgestos con motivo, pausas
 * entre frases, luz real del lugar y sonido de micrófono de celular.
 *
 * Modo "UGC de producto": el primer cuadro de un video de referencia (ej. un
 * TikTok) da el lugar, la luz y el encuadre; la foto del producto manda sobre
 * cómo es el producto; el guion es propio (habla del producto, no copia el video).
 */

export type Motor = 'kling3' | 'omni';
/** Cómo aparece el producto en el UGC. */
export type UsoProducto = 'puesto' | 'mano';

export const ESCENARIOS: { id: string; label: string; en: string }[] = [
  { id: 'sillon', label: '🛋️ Sillón', en: 'sitting sideways on a beige fabric sofa in a lived-in living room, a window at camera-left, a few cushions and a throw blanket' },
  { id: 'cama', label: '🛏️ Cama', en: 'sitting cross-legged on her unmade bed in a cozy bedroom, soft daylight from a window at camera-left, a nightstand lamp off in the background' },
  { id: 'auto', label: '🚗 Auto', en: 'sitting in the driver seat of her parked car, seatbelt off, daylight through the windshield and side window, the street softly visible outside' },
  { id: 'cocina', label: '🍳 Cocina', en: 'sitting on a stool at her kitchen counter, a mug beside her hand, daylight from a window behind the counter at camera-left' },
  { id: 'cafe', label: '☕ Café', en: 'sitting at a small table in a quiet café, a cup in front of her, window light from camera-left, a couple of customers far in the background' },
  { id: 'escritorio', label: '💻 Escritorio', en: 'sitting at her desk at home, a laptop half-closed beside her, a window at camera-left, a plant and a few books in the background' },
];

export const GRABACIONES: { id: string; label: string; en: string; soloUgc?: boolean }[] = [
  { id: 'ref', label: '🎞️ Como en el video', en: 'The same camera setup as the opening frame: same phone, distance, height, angle and framing, with the same fixed or handheld feel (small natural breathing movements if handheld)', soloUgc: true },
  { id: 'apoyado', label: '📱 Celular apoyado', en: 'Her phone is propped up on a surface in front of her at chest height, about one metre away, recording with the front camera; the frame stays fixed with only tiny vibrations when she touches the surface' },
  { id: 'selfie', label: '🤳 Selfie en mano', en: 'She holds the phone herself at arm\'s length with one hand (front camera, slightly above eye level); small breathing-driven movements and subtle wrist drift, one late reframing when she moves, then it settles. Only her other hand is free' },
  { id: 'amiga', label: '👭 La filma alguien', en: 'A friend seated opposite records with the phone\'s rear camera at chest height, about one metre away; slightly off-center framing, small handheld breathing movements' },
];

/** Celular apoyado: la forma de grabar por defecto. */
const GRABACION_DEF = GRABACIONES.find((x) => x.id === 'apoyado') ?? GRABACIONES[0];

export const ESTILOS: { id: string; label: string; desc: string }[] = [
  { id: 'storytime', label: 'Storytime / confesión', desc: 'Cuenta algo que le pasó, como un secreto entre amigas.' },
  { id: 'opinion', label: 'Opinión que genera debate', desc: 'Una postura clara que invita a comentar.' },
  { id: 'consejo', label: 'Consejo rápido', desc: 'Un tip útil y concreto, dicho con naturalidad.' },
  // UGC de producto
  { id: 'resena', label: 'Reseña honesta', desc: 'Lo probó y cuenta qué le gustó, como a una amiga.' },
  { id: 'problema', label: 'Problema → solución', desc: 'Un problema común y cómo el producto se lo resolvió.' },
  { id: 'hallazgo', label: 'Hallazgo / recomendación', desc: '“Encontré esto y no puedo parar de usarlo”.' },
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
  const g = GRABACIONES.find((x) => x.id === grabacion && !x.soloUgc) ?? GRABACION_DEF;
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
 * Foto inicial del UGC. Las imágenes van en este orden: 1 = primer cuadro del
 * video de referencia, después las caras, la foto de cuerpo (si hay) y al
 * final el producto. Del cuadro se toma el lugar, la luz y el encuadre (nunca
 * la persona); el producto es la autoridad sobre cómo es el producto.
 */
export function componerFotoUGC(o: { caras: number; conCuerpo: boolean; uso: UsoProducto; instr?: string; cuerpo?: string; fijo?: string }): string {
  const lista = (a: number, b: number) => (a === b ? `Image ${a}` : `Images ${a}-${b}`);
  const ultCara = 1 + o.caras;
  const nCuerpo = o.conCuerpo ? ultCara + 1 : 0;
  const nProd = (nCuerpo || ultCara) + 1;
  const medidas = medidasDe(o.cuerpo, o.fijo);
  const figura = describirCuerpo(medidas);
  const prod = `Image ${nProd}`;
  return [
    figura ? `Photorealistic vertical phone photo of a woman with ${figura}.` : 'Photorealistic vertical phone photo.',
    'Image 1 is the opening frame of a real phone video (UGC). Use it as the realism and composition guide for the whole image, not just the layout: recreate the same kind of place and background, the same light (direction, color, softness, time of day), the same camera height, angle, lens, distance and framing, and the same phone-camera texture and depth of field. Keep a similar body position and attitude, so she looks like she is about to start talking in that same moment.',
    'Replace the person of Image 1 completely: nothing of that person may remain (face, hair, body, clothes, accessories). Do not copy any text, captions, stickers or app interface that appear on Image 1.',
    o.caras ? `${lista(2, ultCara)} show the woman's face and identity: the person in the result must be exactly her — same face, bone structure, face width, skin tone, freckles, eye color and hair. Do not alter, widen or round her face.` : '',
    nCuerpo ? pistaFotoCuerpo(`Image ${nCuerpo}`) : '',
    pistaCuerpo(medidas),
    o.uso === 'puesto'
      ? `${prod} is the PRODUCT and it is the authority for that item: she wears exactly that item from ${prod}, replacing the matching garment of the original outfit. Preserve its exact shape, cut, length, fit, color, material and texture, seams, zips, buttons, hardware, pockets, logos and every detail. Folds, creases, highlights and contact shadows must look physically natural on HER body under the light of the scene. The item is worn, never held or shown as an inset. If ${prod} shows a person wearing it, take ONLY the item — never that person's body, face, pose or background. The rest of her outfit is simple and fits the place, so the product stands out.`
      : `${prod} is the PRODUCT and it is the authority for that item: she holds exactly that product naturally in one hand at chest height, turned so its front and label face the camera, at its correct real-world size. Preserve its exact shape, proportions, color, material, packaging, label, logo and printed text — never invent, change or blur letters. Her fingers wrap around it naturally (correct number of fingers, no merging with the product). Her outfit is casual and fits the place.`,
    o.instr?.trim() ? `Also: ${o.instr.trim().replace(/[.\s]+$/, '')}.` : '',
    figura ? 'Remember: keep her exact figure described above.' : '',
    pistaFija(o.fijo, !figura),
    REALISMO,
  ].filter(Boolean).join(' ');
}

/** Lugar que se le pasa al guion y al video en el modo UGC (lo da el primer cuadro). */
export const ESCENARIO_UGC = 'in the same real, everyday place as the opening frame (keep that exact background and light)';

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
  /** UGC de producto: el producto del primer cuadro tiene que quedar idéntico. */
  producto?: UsoProducto;
}): string {
  const g = GRABACIONES.find((x) => x.id === o.grabacion) ?? GRABACION_DEF;
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
    o.producto ? `SETTING / LIGHT: ${o.escenario.trim()}. The light of the first frame stays consistent.` : `SETTING / LIGHT: ${o.escenario.trim()}. Motivated natural light from the window; light direction stays consistent.`,
    o.producto ? `PRODUCT: the ${o.producto === 'puesto' ? 'item she wears' : 'product in her hand'} stays exactly as in the first frame (shape, color, material, logo, details)${o.producto === 'mano' ? ', label readable; she may tilt it toward the camera once' : ''}. No other products.` : '',
    `CAMERA: ${g.en}.`,
    `ACTION: An unguarded, unperformed moment. ${ella} talks to the camera as if to a close friend, ${o.producto ? 'sharing something she genuinely likes, not a sales pitch' : 'not presenting'}. Micro-gestures with a reason: a brief glance away while she thinks, eyebrows lifting on the key word, a small exhale or soft laugh, a hand that moves naturally once and rests again. Natural blinking, a quiet breath before the first word.${o.gestos ? ` ${o.gestos.trim().slice(0, 400)}` : ''}`,
    `DIALOGUE: ${ella} speaks in the language and accent described as "${o.idioma.trim()}"${voz}, conversational delivery with natural pauses between phrases (do not rush, leave a short silence where it fits): "${o.texto.trim()}"`,
    'AUDIO: phone-microphone perspective, close natural voice with faint room reflections, quiet room tone. No music, no narration, no sound effects added in post.',
    'SKIN: visible pores, natural skin-color variation, freckles stable through movement, a few flyaways catching the light; mostly matte cheeks.',
    'CONSTRAINTS: no beauty smoothing, no waxy skin, no forced presenter smile, no repeated gestures on a loop, no exaggerated camera shake, no subtitles or text on screen, no extra people talking, no morphing fingers. Keep her face, outfit and the place consistent.',
  ];
  // Kling acepta hasta 2500 caracteres y Omni hasta 20000. Si no entra, primero
  // sale la línea de piel (la más prescindible) y después se recorta el final.
  const max = o.motor === 'kling3' ? 2500 : 6000;
  let txt = partes.filter(Boolean).join('\n');
  if (txt.length > max) txt = partes.filter((x) => x && !x.startsWith('SKIN:')).join('\n');
  return txt.slice(0, max);
}

/** Pedido a la IA de texto para los 3 guiones (estilo Estratega AvatarHype). */
export function pedidoGuiones(o: { tema: string; idioma: string; dur: number; nombre: string; escenario: string; extra?: string; ugc?: boolean }): string {
  const max = palabrasMax(o.dur);
  const estilos = o.ugc
    ? [
      'Write exactly 3 scripts, one per style. This is a UGC video: she naturally talks about the product in the topic, in her own words (the creator brings the product; never copy another video\'s lines):',
      '1. "resena": an honest mini review — she tried it and says what she likes, with one concrete detail.',
      '2. "problema": a common, relatable problem and how this product solved it for her.',
      '3. "hallazgo": "I found this and can\'t stop using it" — excited discovery, one concrete reason.',
      'Name the product the way the creator wrote it. Only mention features and benefits written in the topic or notes — never invent prices, discounts, ingredients, results, numbers or claims.',
    ]
    : [
      'Write exactly 3 scripts, one per style:',
      '1. "storytime": a confession or something that happened to her, told like a secret to a friend.',
      '2. "opinion": a clear, slightly polarizing take that makes people want to comment.',
      '3. "consejo": one quick, concrete, useful tip.',
    ];
  return [
    `You write short talking-to-camera scripts for ${o.nombre || 'an AI influencer'}, a young woman who posts casual selfie videos on TikTok and Instagram Reels.`,
    `Topic / idea: ${o.tema.trim()}`,
    o.extra?.trim() ? `Extra notes from the creator: ${o.extra.trim()}` : '',
    `Language and tone for everything she SAYS: ${o.idioma.trim()}. Write the spoken lines natively in that language (not translated-sounding), with natural contractions and filler words a real person would use.`,
    `The video lasts ${o.dur} seconds, so the full spoken text must be at most ${max} words (fewer is better: she needs room for pauses and breaths).`,
    `She is ${o.escenario.trim()}.`,
    ...estilos,
    'Each script needs: a hook that stops the scroll in the first 2 seconds (curiosity, tension or a bold statement — never "Hi guys" or a greeting), a short development, and a closing line that invites a comment or a follow (soft, not salesy).',
    'Also write "gestos": 1-2 short sentences IN ENGLISH with the micro-gestures and small actions that fit the script (e.g. "She glances away and laughs softly before the hook, then leans in slightly on the key line"). Keep them subtle and motivated.',
    'And "caption": a short post caption in the same language as the spoken text, with 3-5 relevant hashtags.',
    'And "traduccion": a faithful translation into Rioplatense Spanish (Argentina) of the full spoken text ("texto"), so the creator understands exactly what she says.',
    'Nothing explicit, no medical/financial claims, no mention of being AI.',
    'Answer by calling the tool entregar_guiones. If you cannot call tools, answer ONLY with the JSON object {"guiones": [ ... ]} using exactly those field names, with no other text.',
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
