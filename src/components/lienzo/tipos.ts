/** Tipos, cajas disponibles y medidas del lienzo de nodos. */

export type Dato = 'video' | 'imagen' | 'texto';
export type TipoNodo = 'video' | 'captura' | 'modelo' | 'vestuario' | 'imagen' | 'prompt' | 'foto' | 'motion' | 'resultado';

export type Puerto = { id: string; label: string; acepta: Dato[]; multi?: boolean };
export type DefNodo = { titulo: string; icono: string; desc: string; entradas: Puerto[]; salida: Dato | null; ia?: boolean };

export type Nodo = { id: string; tipo: TipoNodo; x: number; y: number; data: Record<string, unknown> };
export type Cable = { id: string; de: string; a: string; puerto: string };
export type Vista = { x: number; y: number; z: number };

export const DEF: Record<TipoNodo, DefNodo> = {
  video: { titulo: 'Video', icono: '🎬', desc: 'El video a recrear', entradas: [], salida: 'video' },
  captura: { titulo: 'Captura', icono: '📸', desc: 'Un momento exacto del video', entradas: [{ id: 'video', label: 'Video', acepta: ['video'] }], salida: 'imagen' },
  modelo: { titulo: 'Modelo', icono: '👩', desc: 'Cara y cuerpo de tu modelo', entradas: [], salida: 'imagen' },
  vestuario: { titulo: 'Vestuario', icono: '👗', desc: 'Ropa para ponerle', entradas: [], salida: 'imagen' },
  imagen: { titulo: 'Imagen', icono: '🖼️', desc: 'Cualquier foto de referencia', entradas: [], salida: 'imagen' },
  prompt: { titulo: 'Prompt', icono: '✍️', desc: 'Instrucciones con texto', entradas: [], salida: 'texto' },
  foto: {
    titulo: 'Foto IA', icono: '✨', desc: 'Crea la imagen con todo lo conectado', ia: true,
    entradas: [{ id: 'imgs', label: 'Imágenes', acepta: ['imagen'], multi: true }, { id: 'txt', label: 'Instrucciones', acepta: ['texto'], multi: true }],
    salida: 'imagen',
  },
  motion: {
    titulo: 'Motion Control', icono: '🕺', desc: 'Anima la imagen con el video', ia: true,
    entradas: [{ id: 'imagen', label: 'Imagen inicial', acepta: ['imagen'] }, { id: 'video', label: 'Video', acepta: ['video'] }, { id: 'txt', label: 'Instrucciones', acepta: ['texto'] }],
    salida: 'video',
  },
  resultado: { titulo: 'Resultado', icono: '✅', desc: 'Ver, descargar y publicar', entradas: [{ id: 'in', label: 'Entrada', acepta: ['video', 'imagen'] }], salida: null },
};

export const ORDEN_MENU: TipoNodo[] = ['video', 'captura', 'modelo', 'vestuario', 'imagen', 'prompt', 'foto', 'motion', 'resultado'];

// Medidas fijas: así la posición de cada "enchufe" se calcula sin medir el DOM.
export const ANCHO = 236;
export const CABEZA = 40;
export const FILA = 30;
export const yEntrada = (i: number) => CABEZA + FILA * i + FILA / 2;
export const ySalida = CABEZA / 2;

export const nuevoId = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Plantilla "Motion exacto": Video → Captura → Foto IA (+ Modelo + Vestuario) → Motion → Resultado. */
export function plantillaMotionExacto(modeloId: string): { nodes: Nodo[]; edges: Cable[] } {
  const id = (s: string) => `${s}-${Date.now().toString(36)}`;
  const v = id('video'), c = id('captura'), m = id('modelo'), ve = id('vest'), p = id('prompt'), f = id('foto'), mo = id('motion'), r = id('res');
  return {
    nodes: [
      // Columnas con aire: las cajas con video crecen hacia abajo al cargarlo.
      { id: v, tipo: 'video', x: 0, y: 0, data: {} },
      { id: ve, tipo: 'vestuario', x: 0, y: 470, data: {} },
      { id: p, tipo: 'prompt', x: 0, y: 820, data: { texto: '' } },
      { id: c, tipo: 'captura', x: 300, y: 0, data: {} },
      { id: m, tipo: 'modelo', x: 300, y: 560, data: { modeloId, cuerpo: true } },
      { id: f, tipo: 'foto', x: 610, y: 160, data: { modelo: 'seedream', aspect: 'auto' } },
      { id: mo, tipo: 'motion', x: 920, y: 0, data: { motor: 'kling3', calidad: '720p', orientacion: 'video' } },
      { id: r, tipo: 'resultado', x: 1230, y: 0, data: {} },
    ],
    edges: [
      { id: id('e1'), de: v, a: c, puerto: 'video' },
      { id: id('e2'), de: c, a: f, puerto: 'imgs' },
      { id: id('e3'), de: m, a: f, puerto: 'imgs' },
      { id: id('e4'), de: ve, a: f, puerto: 'imgs' },
      { id: id('e5'), de: p, a: f, puerto: 'txt' },
      { id: id('e6'), de: f, a: mo, puerto: 'imagen' },
      { id: id('e7'), de: v, a: mo, puerto: 'video' },
      { id: id('e8'), de: mo, a: r, puerto: 'in' },
    ],
  };
}
