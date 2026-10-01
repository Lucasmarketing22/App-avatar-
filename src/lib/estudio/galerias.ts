/**
 * Galerías "con foto": la usuaria sube imágenes de referencia y, al elegir una,
 * esa imagen se le manda a la IA junto con la cara del personaje. Cada galería
 * trae un "hint" (texto en inglés) que le explica a la IA para qué sirve esa
 * imagen de referencia.
 *
 * Vestidos tiene su propia galería aparte (histórica). Estas son las nuevas.
 */
export type GaleriaDef = { key: string; titulo: string; emoji: string; hint: string };

export const GALERIAS: GaleriaDef[] = [
  { key: 'peinados', titulo: 'Peinados', emoji: '💇', hint: 'Give her a hairstyle like the one shown in the hairstyle reference image.' },
  { key: 'poses', titulo: 'Poses / Gestos', emoji: '🤳', hint: 'Use a pose and body language like the one shown in the pose reference image.' },
  { key: 'escenas', titulo: 'Escenas / Fondos', emoji: '🏙️', hint: 'Place her in a setting and background like the one shown in the scene reference image.' },
  { key: 'cine', titulo: 'Looks de cine', emoji: '🎥', hint: 'Match the color grade, lighting and cinematic mood of the film-look reference image.' },
];

export const GALERIA_KEYS = GALERIAS.map((g) => g.key);
