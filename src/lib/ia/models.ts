/**
 * Modelos de imagen disponibles en Kie (IDs verificados en docs.kie.ai).
 * Como SIEMPRE mandamos la cara del personaje como referencia, usamos la
 * variante de edición / imagen-a-imagen de cada modelo.
 *
 * Ojo: cada modelo usa un NOMBRE DE CAMPO distinto para las imágenes de
 * referencia y parámetros propios. Por eso cada uno trae su "refsField" y su
 * "extra".
 */
export type ModeloId = 'nano' | 'nanopro' | 'seedream' | 'flux';

export type ModeloDef = {
  id: ModeloId;
  label: string;
  desc: string;
  kieModel: string;
  refsField: 'image_urls' | 'image_input' | 'input_urls';
  aspects: string[]; // relaciones de aspecto soportadas
  extra: (aspect: string) => Record<string, unknown>;
};

const COMUNES = ['1:1', '3:4', '4:3', '9:16', '16:9'];

export const MODELOS: ModeloDef[] = [
  {
    id: 'nano',
    label: 'Nano Banana',
    desc: 'Rápido y económico. Bueno para probar.',
    kieModel: 'google/nano-banana-edit',
    refsField: 'image_urls',
    aspects: ['1:1', '3:4', '4:3', '9:16', '16:9', '4:5'],
    extra: (a) => ({ aspect_ratio: a, output_format: 'png' }),
  },
  {
    id: 'nanopro',
    label: 'Nano Banana Pro',
    desc: 'Más calidad y detalle (hasta 4K). Un poco más caro.',
    kieModel: 'nano-banana-pro',
    refsField: 'image_input',
    aspects: ['1:1', '3:4', '4:3', '9:16', '16:9', '4:5'],
    extra: (a) => ({ aspect_ratio: a, resolution: '2K', output_format: 'png' }),
  },
  {
    id: 'seedream',
    label: 'Seedream 4.5',
    desc: 'Muy realista y nítido (4K). Ideal para fotos de producto/moda.',
    kieModel: 'seedream/4.5-edit',
    refsField: 'image_urls',
    aspects: COMUNES,
    extra: (a) => ({ aspect_ratio: a, quality: 'basic' }),
  },
  {
    id: 'flux',
    label: 'Flux 2 Pro',
    desc: 'Fotográfico y detallado. Bueno para cambios de outfit.',
    kieModel: 'flux-2/pro-image-to-image',
    refsField: 'input_urls',
    aspects: COMUNES,
    extra: (a) => ({ aspect_ratio: a, resolution: '2K' }),
  },
];

export function buscarModelo(id?: string): ModeloDef {
  return MODELOS.find((m) => m.id === id) ?? MODELOS[0];
}
