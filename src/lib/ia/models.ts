/**
 * Modelos de imagen disponibles en Kie (IDs verificados en docs.kie.ai).
 * Como SIEMPRE mandamos la cara del personaje como referencia, usamos la
 * variante de edición / imagen-a-imagen de cada modelo.
 *
 * Ojo: cada modelo usa un NOMBRE DE CAMPO distinto para las imágenes de
 * referencia y parámetros propios. Por eso cada uno trae su "refsField" y su
 * "extra".
 */
export type ModeloId = 'nano' | 'nanopro' | 'seedream' | 'flux' | 'qwen';

export type ModeloDef = {
  id: ModeloId;
  label: string;
  desc: string;
  kieModel: string;
  refsField: 'image_urls' | 'image_input' | 'input_urls' | 'image_url';
  /** Si true, el campo de referencia recibe UNA sola imagen (string), no un array. */
  refsSingle?: boolean;
  aspects: string[]; // relaciones de aspecto soportadas
  extra: (aspect: string) => Record<string, unknown>;
};

const COMUNES = ['1:1', '3:4', '4:3', '9:16', '16:9'];

// Qwen usa "image_size" (enum) en vez de aspect_ratio.
const QWEN_SIZE: Record<string, string> = {
  '1:1': 'square_hd',
  '3:4': 'portrait_4_3',
  '4:5': 'portrait_4_3',
  '9:16': 'portrait_16_9',
  '16:9': 'landscape_16_9',
  '4:3': 'landscape_4_3',
};

export const MODELOS: ModeloDef[] = [
  {
    id: 'nano',
    label: 'Nano Banana',
    desc: 'Rápido y económico. Bueno para probar.',
    kieModel: 'google/nano-banana-edit',
    refsField: 'image_urls',
    aspects: ['1:1', '3:4', '4:3', '9:16', '16:9', '4:5'],
    // jpeg: archivo más liviano que png => se descarga y guarda más rápido.
    extra: (a) => ({ aspect_ratio: a, output_format: 'jpeg' }),
  },
  {
    id: 'nanopro',
    label: 'Nano Banana Pro',
    desc: 'Más calidad y detalle, en 2K. Un poco más caro y a veces más lento (Google se satura).',
    kieModel: 'nano-banana-pro',
    refsField: 'image_input',
    aspects: ['1:1', '3:4', '4:3', '9:16', '16:9', '4:5'],
    // Ojo: este modelo escribe 'jpg' (el de arriba 'jpeg').
    extra: (a) => ({ aspect_ratio: a, resolution: '2K', output_format: 'jpg' }),
  },
  {
    id: 'seedream',
    label: 'Seedream 4.5',
    desc: 'El más realista y nítido, en 2K. El mejor para fotos de moda, bikini y sensual.',
    kieModel: 'seedream/4.5-edit',
    refsField: 'image_urls',
    aspects: COMUNES,
    // quality 'basic' = salida 2K ('high' = 4K, bastante más lento). nsfw_checker off = menos rechazos en tomas sensuales.
    extra: (a) => ({ aspect_ratio: a, quality: 'basic', nsfw_checker: false }),
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
  {
    id: 'qwen',
    label: 'Libre 🔓 (sin censura)',
    desc: 'Sin filtro de contenido. Toma 1 foto de tu modelo como base (la primera). Para contenido sensual o adulto (Fanvue). La cara puede variar un poco más.',
    kieModel: 'qwen/image-edit',
    refsField: 'image_url',
    refsSingle: true,
    aspects: ['1:1', '3:4', '4:3', '9:16', '16:9', '4:5'],
    extra: (a) => ({
      image_size: QWEN_SIZE[a] ?? 'portrait_4_3',
      enable_safety_checker: false,
      nsfw_checker: false,
      output_format: 'png',
    }),
  },
];

export function buscarModelo(id?: string): ModeloDef {
  return MODELOS.find((m) => m.id === id) ?? MODELOS[0];
}
