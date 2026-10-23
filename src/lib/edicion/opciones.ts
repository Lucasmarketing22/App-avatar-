/**
 * Qué tipo de edición pide la persona (se elige en la pantalla "✂️ Editar").
 * Lo usan el celular y el servidor.
 *  - natural: cortes + subtítulos sutiles (que parezca real).
 *  - pro: captions con rebote y emoji, zoom, transiciones, sonidos, color y
 *    cierre con producto; cada capa se puede apagar.
 */
export type OpcionesEdicion = {
  estilo: 'natural' | 'pro';
  emojis: boolean;
  sonidos: boolean;
  movimiento: boolean;
  color: boolean;
  cierre: boolean;
  /** Cierre: foto del producto (URL de la app). Si falta, no hay cierre. */
  foto?: string;
  /** Cierre: si quedan vacíos, la IA los saca de lo que se dice en el video. */
  marca?: string;
  beneficios?: string[];
  cta?: string;
};

export const OPCIONES_BASE: OpcionesEdicion = { estilo: 'pro', emojis: true, sonidos: true, movimiento: true, color: true, cierre: true };

const texto = (x: unknown, max: number) => (typeof x === 'string' ? x.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** Lo que llega del celular, revisado. */
export function limpiarOpciones(x: unknown): OpcionesEdicion {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const si = (k: keyof OpcionesEdicion) => (typeof o[k] === 'boolean' ? (o[k] as boolean) : (OPCIONES_BASE[k] as boolean));
  const foto = typeof o.foto === 'string' && o.foto.startsWith('https://') ? o.foto : undefined;
  const beneficios = Array.isArray(o.beneficios) ? o.beneficios.map((b) => texto(b, 40)).filter(Boolean).slice(0, 3) : [];
  return {
    estilo: o.estilo === 'natural' ? 'natural' : 'pro',
    emojis: si('emojis'),
    sonidos: si('sonidos'),
    movimiento: si('movimiento'),
    color: si('color'),
    cierre: si('cierre') && !!foto,
    foto,
    marca: texto(o.marca, 30) || undefined,
    beneficios: beneficios.length ? beneficios : undefined,
    cta: texto(o.cta, 24) || undefined,
  };
}
