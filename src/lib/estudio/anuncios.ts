/**
 * Clientes: la ficha de cada marca (logo, colores, tono, productos) y los
 * anuncios en foto con el texto ya puesto, para trabajar de social media manager.
 *  1) La IA de texto escribe 3 ideas de anuncio para la marca (titular, texto
 *     chico, botón, caption y la escena en inglés).
 *  2) Cada idea se crea con Nano Banana Pro (el que mejor escribe texto dentro
 *     de la imagen), con las fotos del producto y el logo como referencia.
 * Los textos de la idea se pueden corregir antes de crear: el prompt de la
 * imagen se arma recién al crear (promptAnuncio).
 */

export type Producto = { url: string; nombre: string };

export type Marca = {
  id: string;
  nombre: string;
  /** A qué se dedica: "cafetería de especialidad", "ropa deportiva"… */
  rubro: string;
  logo: string;
  /** Colores de la marca en hex (#rrggbb), el primero es el principal. */
  colores: string[];
  tono: string;
  publico: string;
  idioma: IdiomaId;
  productos: Producto[];
  /** Lo que nunca tiene que aparecer o decirse. */
  evitar: string;
  ts: number;
};

export type IdiomaId = 'neutro' | 'rioplatense' | 'ingles';
export const IDIOMAS: { id: IdiomaId; label: string; pedido: string }[] = [
  { id: 'neutro', label: 'Español neutro', pedido: 'español neutro (sin voseo, sirve para cualquier país)' },
  { id: 'rioplatense', label: 'Español con "vos"', pedido: 'español rioplatense (con voseo: "vos", "aprovechá", "pedí")' },
  { id: 'ingles', label: 'Inglés', pedido: 'English (US)' },
];

export const TONOS = ['Cercano', 'Premium', 'Divertido', 'Profesional', 'Juvenil', 'Natural'];

export type ObjetivoId = 'promo' | 'lanzamiento' | 'estrella' | 'fecha' | 'testimonio' | 'consejo';
export const OBJETIVOS: { id: ObjetivoId; label: string; pedido: string }[] = [
  { id: 'promo', label: '🏷️ Promo / descuento', pedido: 'una promoción o descuento: la oferta tiene que leerse en 1 segundo' },
  { id: 'lanzamiento', label: '🚀 Lanzamiento', pedido: 'el lanzamiento de un producto nuevo: novedad y ganas de probarlo' },
  { id: 'estrella', label: '⭐ Producto estrella', pedido: 'mostrar el producto más vendido y por qué gusta' },
  { id: 'fecha', label: '🎉 Fecha especial', pedido: 'una fecha especial (feriado, Día de la Madre, Navidad, aniversario…)' },
  { id: 'testimonio', label: '💬 Testimonio', pedido: 'la opinión de un cliente contento, como reseña con estrellas (sin nombres reales ni inventar datos)' },
  { id: 'consejo', label: '💡 Consejo', pedido: 'un consejo útil del rubro que deja a la marca como experta' },
];

export type FormatoId = '4:5' | '9:16' | '1:1';
export const FORMATOS: { id: FormatoId; label: string; en: string }[] = [
  { id: '4:5', label: '📱 Feed 4:5', en: 'vertical 4:5 Instagram feed post' },
  { id: '9:16', label: '📲 Historia 9:16', en: 'vertical 9:16 Instagram/TikTok story, keep the top 250 px and bottom 300 px free of text' },
  { id: '1:1', label: '⬜ Cuadrado 1:1', en: 'square 1:1 post' },
];

/** Una idea de anuncio (lo que escribe la IA de texto). Los textos se pueden corregir. */
export type Idea = {
  estilo: string;
  titular: string;
  bajada: string;
  boton: string;
  caption: string;
  /** La escena y el diseño en inglés, sin los textos (van aparte, entre comillas). */
  escena: string;
};

const limpio = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function limpiarIdeas(datos: unknown): Idea[] {
  const lista = (datos as { ideas?: unknown[] } | null)?.ideas;
  if (!Array.isArray(lista)) return [];
  return lista.slice(0, 3).map((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    return {
      estilo: limpio(o.estilo, 60),
      titular: limpio(o.titular, 80),
      bajada: limpio(o.bajada, 140),
      boton: limpio(o.boton, 40),
      caption: limpio(o.caption, 1200),
      escena: limpio(o.escena, 1500),
    };
  }).filter((i) => i.titular && i.escena);
}

/** Pedido a la IA de texto: 3 ideas distintas para esta marca. */
export function pedidoIdeas(m: Marca, objetivo: ObjetivoId, formato: FormatoId, detalle: string, productos: string[]): string {
  const idioma = IDIOMAS.find((i) => i.id === m.idioma) ?? IDIOMAS[0];
  const obj = OBJETIVOS.find((o) => o.id === objetivo) ?? OBJETIVOS[0];
  const fmt = FORMATOS.find((f) => f.id === formato) ?? FORMATOS[0];
  return [
    'Sos director creativo de una agencia de redes sociales. Escribí 3 ideas de anuncio en FOTO (una sola imagen con texto) para esta marca.',
    '',
    `MARCA: ${m.nombre}${m.rubro ? ` (${m.rubro})` : ''}`,
    m.publico ? `PÚBLICO: ${m.publico}` : '',
    m.tono ? `TONO: ${m.tono}` : '',
    m.colores.length ? `COLORES DE LA MARCA: ${m.colores.join(', ')} (el primero es el principal)` : '',
    m.logo ? 'Tiene logo (se pone en la imagen desde la foto de referencia).' : 'No tiene logo cargado: el nombre de la marca puede ir escrito chico.',
    productos.length ? `PRODUCTOS EN LA FOTO (vienen como fotos de referencia): ${productos.join(', ')}` : 'Sin fotos de producto: la escena muestra el rubro de forma atractiva.',
    m.evitar ? `NUNCA: ${m.evitar}` : '',
    '',
    `OBJETIVO: ${obj.pedido}.`,
    detalle ? `LO QUE QUIERE COMUNICAR EL CLIENTE (respetá datos, precios y fechas tal cual): ${detalle}` : '',
    `FORMATO: ${fmt.en}.`,
    `IDIOMA DE LOS TEXTOS DEL ANUNCIO Y DEL CAPTION: ${idioma.pedido}.`,
    '',
    'REGLAS:',
    '- Las 3 ideas tienen que ser bien distintas entre sí (composición, ángulo y estilo visual), no variaciones de la misma.',
    '- Titular de máximo 6 palabras, que se entienda en 1 segundo. Bajada de máximo 10 palabras. Botón de 1 a 3 palabras.',
    '- No inventes precios, descuentos, fechas, direcciones ni datos que no estén arriba.',
    '- "escena" en inglés: describe la foto y el diseño (producto, fondo, luz, composición, dónde va cada texto y el logo, colores en hex). NO escribas los textos ahí: van aparte. Estilo de publicidad profesional de Instagram, fotorrealista, nada de "IA" plástica.',
    '- Caption listo para publicar, en el idioma pedido, con 3 a 6 hashtags al final.',
  ].filter((l) => l !== '').join('\n');
}

/** Prompt final de la imagen (Nano Banana Pro): escena + textos exactos + logo y productos de las referencias. */
export function promptAnuncio(m: Marca, idea: Idea, formato: FormatoId, nProductos: number, conLogo: boolean): string {
  const fmt = FORMATOS.find((f) => f.id === formato) ?? FORMATOS[0];
  const refs: string[] = [];
  if (nProductos) refs.push(`${nProductos === 1 ? 'image 1 is the product: reproduce it' : `images 1 to ${nProductos} are the products: reproduce them`} exactly as in the photos (same shape, colors, label and packaging text)`);
  if (conLogo) refs.push(`image ${nProductos + 1} is the brand logo: place it small and clean, exactly as in the image, never redrawn or altered`);
  const textos = [
    `headline "${idea.titular}"`,
    idea.bajada ? `secondary line "${idea.bajada}"` : '',
    idea.boton ? `a button or tag that says "${idea.boton}"` : '',
  ].filter(Boolean).join(', ');
  return [
    `Professional social media ad for the brand ${m.nombre}${m.rubro ? ` (${m.rubro})` : ''}, ${fmt.en}.`,
    idea.escena,
    refs.length ? `REFERENCE IMAGES: ${refs.join('; ')}.` : '',
    m.colores.length ? `Brand colors: ${m.colores.join(', ')}.` : '',
    `TEXT ON THE IMAGE, written exactly like this, letter by letter, with these accents and punctuation: ${textos}. Add no other text (the logo and the product labels stay as they are). Clean modern typography, high contrast, perfectly legible on a phone.`,
    m.evitar ? `Never show: ${m.evitar}.` : '',
    'Photorealistic, premium commercial quality, real textures and lighting, no watermark.',
  ].filter(Boolean).join('\n\n');
}
