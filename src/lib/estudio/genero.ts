/**
 * Personajes hombre o mujer. Los prompts de Hablados están escritos para una
 * mujer ("she", "her", "the woman"); para un hombre se pasan a masculino al
 * final, sin tocar nada si es mujer (así lo que ya funciona queda igual).
 */
export type Genero = 'mujer' | 'hombre';

export const generoValido = (g: unknown): Genero => (g === 'hombre' ? 'hombre' : 'mujer');

/** Palabras tras las que "her" es objeto ("look at her and…") y no posesivo ("her face"). */
const TRAS_OBJETO = new Set([
  'in', 'into', 'a', 'an', 'the', 'to', 'toward', 'towards', 'at', 'from', 'with', 'and', 'or', 'as', 'on', 'onto', 'about',
  'while', 'not', 'handheld', 'again', 'down', 'up', 'back', 'once', 'directly', 'for', 'by', 'off', 'out', 'over', 'than',
  'that', 'this', 'when', 'who', 'is', 'was', 'be', 'so', 'too', 'look', 'feel', 'seem', 'appear', 'more', 'less',
]);

const conMayus = (modelo: string, txt: string) =>
  modelo === modelo.toUpperCase() && modelo.length > 1 ? txt.toUpperCase() : modelo[0] === modelo[0].toUpperCase() ? txt[0].toUpperCase() + txt.slice(1) : txt;

/** Pasa a masculino un texto en inglés escrito para una mujer. */
export function enGenero(txt: string, genero?: Genero): string {
  if (genero !== 'hombre' || !txt) return txt;
  return txt
    .replace(/\bher\b(?=(\W*)(\w*))/gi, (m, sep: string, sig: string) => {
      // Objeto: al final, antes de puntuación o antes de una preposición/verbo. Si no, posesivo.
      const objeto = !sig || /[.,;:!?)"\]—–-]/.test(sep) || TRAS_OBJETO.has(sig.toLowerCase());
      return conMayus(m, objeto ? 'him' : 'his');
    })
    .replace(/\bherself\b/gi, (m) => conMayus(m, 'himself'))
    .replace(/\bhers\b/gi, (m) => conMayus(m, 'his'))
    .replace(/\bshe\b/gi, (m) => conMayus(m, 'he'))
    .replace(/\bwomen\b/gi, (m) => conMayus(m, 'men'))
    .replace(/\bwoman\b/gi, (m) => conMayus(m, 'man'))
    .replace(/\bgirls\b/gi, (m) => conMayus(m, 'guys'))
    .replace(/\bgirl\b/gi, (m) => conMayus(m, 'guy'))
    .replace(/\bgirlfriends?\b/gi, (m) => conMayus(m, 'friend'))
    .replace(/\bfreckles stable through movement\b/gi, 'facial details stable through movement')
    .replace(/, freckles,/gi, ',');
}
