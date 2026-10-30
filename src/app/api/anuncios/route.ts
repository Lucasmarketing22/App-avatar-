import { NextResponse } from 'next/server';

import { FORMATOS, limpiarIdeas, OBJETIVOS, pedidoIdeas, type FormatoId, type Marca, type ObjetivoId } from '@/lib/estudio/anuncios';
import { pedirDatos } from '@/lib/ia/texto';
import { cobrarAhora, puedeGastar, TEXTO_ESTIMADO } from '@/lib/saldo';
import { readJson } from '@/lib/storage';

export const runtime = 'nodejs';
export const maxDuration = 60;

const TEXTO = { type: 'string' };
const HERRAMIENTA = {
  name: 'entregar_ideas',
  description: 'Entrega las 3 ideas de anuncio en foto.',
  input_schema: {
    type: 'object',
    required: ['ideas'],
    properties: {
      ideas: {
        type: 'array',
        minItems: 3,
        maxItems: 3,
        items: {
          type: 'object',
          required: ['estilo', 'titular', 'bajada', 'boton', 'caption', 'escena'],
          properties: {
            estilo: { ...TEXTO, description: 'Nombre corto del enfoque, en español (máx. 4 palabras).' },
            titular: { ...TEXTO, description: 'Titular de la imagen (máx. 6 palabras), en el idioma pedido.' },
            bajada: { ...TEXTO, description: 'Texto chico de la imagen (máx. 10 palabras), en el idioma pedido.' },
            boton: { ...TEXTO, description: 'Texto del botón o etiqueta (1 a 3 palabras), en el idioma pedido.' },
            caption: { ...TEXTO, description: 'Texto para publicar con 3 a 6 hashtags, en el idioma pedido.' },
            escena: { ...TEXTO, description: 'La foto y el diseño en inglés, sin los textos.' },
          },
        },
      },
    },
  },
};

/** Clientes → 3 ideas de anuncio en foto para una marca (la imagen se crea después, con /api/generate). */
export async function POST(request: Request) {
  const b = (await request.json().catch(() => null)) as { marcaId?: string; objetivo?: string; formato?: string; detalle?: string; productos?: string[] } | null;
  const { items } = await readJson<{ items: Marca[] }>('marcas', { items: [] });
  const marca = (items ?? []).find((m) => m.id === b?.marcaId);
  if (!marca) return NextResponse.json({ error: 'Elegí una marca guardada.' }, { status: 400 });
  const objetivo = (OBJETIVOS.some((o) => o.id === b?.objetivo) ? b!.objetivo : 'promo') as ObjetivoId;
  const formato = (FORMATOS.some((f) => f.id === b?.formato) ? b!.formato : '4:5') as FormatoId;
  const detalle = typeof b?.detalle === 'string' ? b.detalle.trim().slice(0, 600) : '';
  const elegidos = new Set(Array.isArray(b?.productos) ? b!.productos : []);
  const productos = marca.productos.filter((p) => elegidos.has(p.url)).map((p, i) => p.nombre || `producto ${i + 1}`);

  const permiso = await puedeGastar(TEXTO_ESTIMADO);
  if (!permiso.ok) return NextResponse.json({ error: permiso.error }, { status: permiso.status });
  const r = await pedirDatos(pedidoIdeas(marca, objetivo, formato, detalle, productos), HERRAMIENTA);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 });
  await cobrarAhora(permiso, r.credits);
  const ideas = limpiarIdeas(r.datos);
  if (!ideas.length) return NextResponse.json({ error: 'La IA no devolvió ideas. Probá de nuevo.' }, { status: 502 });
  return NextResponse.json({ ideas });
}
