import type { RolImagen } from '@/lib/estudio/prompt';

/** Descripción de solo la ropa de una foto de vestuario (null si no se pudo). */
export async function describirVestuario(url: string): Promise<string | null> {
  try {
    const r = await fetch('/api/describir-vestuario', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
    const d = await r.json().catch(() => ({}));
    return r.ok && typeof d.descripcion === 'string' && d.descripcion.trim() ? d.descripcion.trim() : null;
  } catch { return null; }
}

/** Texto que reemplaza a la foto de vestuario en el pedido. */
export function textoVestuario(desc: string): string {
  return `OUTFIT: dress her in exactly this outfit — ${desc} Re-fit every garment to HER own figure (her bust, waist and hips).`;
}

/**
 * Cómo se usa la foto de la ropa (lo elige la usuaria, se recuerda en el celu):
 *  - 'cuerpo': la foto NO va a la IA de imagen, va su descripción. El cuerpo
 *    sale como el de la modelo; estampados muy detallados pueden variar.
 *  - 'exacta': la foto va tal cual. La ropa sale igual, pero la IA puede
 *    copiar también el cuerpo de quien la tiene puesta.
 */
export type ModoRopa = 'cuerpo' | 'exacta';
const CLAVE_MODO = 'musa-ropa-modo';
export function prefModoRopa(): ModoRopa {
  try { return localStorage.getItem(CLAVE_MODO) === 'exacta' ? 'exacta' : 'cuerpo'; } catch { return 'cuerpo'; }
}
export function guardarModoRopa(m: ModoRopa) {
  try { localStorage.setItem(CLAVE_MODO, m); } catch { /* */ }
}

/**
 * En modo 'cuerpo' saca las fotos de vestuario de la lista de imágenes y las
 * cambia por su descripción en texto: así la IA de imagen nunca ve el cuerpo
 * de la persona que tenía puesta la ropa. Si alguna no se puede describir, esa
 * foto queda y `fallo` avisa (para decírselo a la usuaria).
 */
export async function vestuarioATexto<T extends { url: string; rol: RolImagen }>(items: T[], modo: ModoRopa = prefModoRopa()): Promise<{ items: T[]; textos: string[]; descripciones: string[]; fallo: boolean }> {
  const vest = items.filter((x) => x.rol === 'vestuario');
  if (!vest.length || modo === 'exacta') return { items, textos: [], descripciones: [], fallo: false };
  const descs = await Promise.all(vest.map((x) => describirVestuario(x.url)));
  const ok = new Set(vest.filter((_, i) => descs[i]).map((x) => x.url));
  const descripciones = descs.filter((d): d is string => !!d);
  return { items: items.filter((x) => !(x.rol === 'vestuario' && ok.has(x.url))), textos: descripciones.map(textoVestuario), descripciones, fallo: descripciones.length < vest.length };
}

export const AVISO_FALLO_ROPA = 'No se pudo leer la ropa de la foto, así que se usó la foto tal cual: puede copiar el cuerpo de quien la tiene puesta.';
