/**
 * "Recrear viral": cada tipo de video viral se recrea distinto. Acá están los
 * ajustes de cada uno (qué motor, qué fotos de la modelo, qué pedirle a la IA).
 */
export type TipoViral = 'baile' | 'hablando' | 'sensual' | 'rostro';

export type DefViral = {
  id: TipoViral;
  emoji: string;
  titulo: string;
  desc: string;
  ejemplo: string;
  /** Usar la foto de cuerpo de la modelo para la foto inicial. */
  conCuerpo: boolean;
  /** Para la foto inicial (además de copiar el cuadro del video). */
  pistaFoto: string;
  /** Para el video (Motion Control). */
  pistaVideo: string;
  tip: string;
};

export const VIRALES: DefViral[] = [
  {
    id: 'baile', emoji: '💃', titulo: 'Baile / trend', desc: 'Cuerpo entero, mucho movimiento',
    ejemplo: 'Bailes de TikTok, trends con pasos, caminatas',
    conCuerpo: true,
    pistaFoto: 'Full body visible as in the frame, same stance and outfit.',
    pistaVideo: 'Copy the full-body choreography exactly: every step, arm movement, hip movement, turn and rhythm, keeping her body proportions.',
    tip: 'Que en el video se vea el cuerpo entero y una sola persona.',
  },
  {
    id: 'hablando', emoji: '🗣️', titulo: 'Hablando a cámara', desc: 'Primer plano, del pecho para arriba',
    ejemplo: 'Selfies hablando, “el primer día para hacerte feliz” + beso',
    conCuerpo: false,
    pistaFoto: 'Close-up selfie framing from the chest up, exactly like the frame (same phone angle and distance), natural friendly expression looking into the camera.',
    pistaVideo: 'Copy exactly her facial expressions, mouth and lip movements as if speaking, smiles, blinks, eyebrow movements, head tilts and kisses to the camera, keeping eye contact with the lens. Handheld smartphone selfie feel.',
    tip: 'Ideal: la cara bien visible y de frente. El video sale sin la voz de la chica original (después le podés sumar la de Mila o texto en pantalla).',
  },
  {
    id: 'sensual', emoji: '💋', titulo: 'Gestos sensuales', desc: 'Besos, miradas, pelo, poses',
    ejemplo: 'Tirar besos, mirar seductora, tocarse el pelo, poses lentas',
    conCuerpo: true,
    pistaFoto: 'Same flirty, confident attitude and framing as the frame.',
    pistaVideo: 'Copy exactly the sensual gestures: looks into the camera, kisses, touching her hair, slow body movements and poses, with elegant, natural and seductive body language.',
    tip: 'Funciona mejor con movimientos lentos y una sola persona.',
  },
  {
    id: 'rostro', emoji: '💄', titulo: 'Primer plano de rostro', desc: 'Maquillaje, skincare, gestos de cara',
    ejemplo: 'Maquillándose, skincare, reacciones de cara',
    conCuerpo: false,
    pistaFoto: 'Tight close-up of her face exactly like the frame (same framing, angle and lighting), skin with real texture.',
    pistaVideo: 'Copy exactly the facial expressions and the hand movements around the face (applying makeup, touching the skin), keeping her face identical and stable.',
    tip: 'Si la cara no sale bien, probá el motor “Reemplazar” (deja el video original y cambia la cara).',
  },
];
