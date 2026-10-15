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
 * Saca las fotos de vestuario de la lista de imágenes y las cambia por su
 * descripción en texto: así la IA de imagen nunca ve el cuerpo de la persona
 * que tenía puesta la ropa. Si no se puede describir, la foto queda (como antes).
 */
export async function vestuarioATexto<T extends { url: string; rol: RolImagen }>(items: T[]): Promise<{ items: T[]; textos: string[]; descripciones: string[] }> {
  const vest = items.filter((x) => x.rol === 'vestuario');
  if (!vest.length) return { items, textos: [], descripciones: [] };
  const descs = await Promise.all(vest.map((x) => describirVestuario(x.url)));
  const ok = new Set(vest.filter((_, i) => descs[i]).map((x) => x.url));
  const descripciones = descs.filter((d): d is string => !!d);
  return { items: items.filter((x) => !(x.rol === 'vestuario' && ok.has(x.url))), textos: descripciones.map(textoVestuario), descripciones };
}
