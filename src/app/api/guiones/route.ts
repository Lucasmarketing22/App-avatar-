import { NextResponse } from 'next/server';

import { limpiarGuiones, pedidoGuiones } from '@/lib/estudio/hablados';
import { pedirDatos } from '@/lib/ia/texto';
import { cobrarAhora, puedeGastar, TEXTO_ESTIMADO } from '@/lib/saldo';

export const runtime = 'nodejs';
export const maxDuration = 60;

const TEXTO = { type: 'string' };
const HERRAMIENTA = {
  name: 'entregar_guiones',
  description: 'Entrega los 3 guiones del video hablado.',
  input_schema: {
    type: 'object',
    required: ['guiones'],
    properties: {
      guiones: {
        type: 'array',
        minItems: 3,
        maxItems: 3,
        items: {
          type: 'object',
          required: ['estilo', 'titulo', 'gancho', 'desarrollo', 'cierre', 'texto', 'gestos', 'caption', 'traduccion'],
          properties: {
            estilo: { type: 'string', enum: ['storytime', 'opinion', 'consejo', 'resena', 'problema', 'hallazgo'] },
            titulo: { type: 'string', description: 'Título corto en español para reconocerlo (máx. 6 palabras).' },
            gancho: { ...TEXTO, description: 'Primera frase (hook), en el idioma pedido.' },
            desarrollo: { ...TEXTO, description: 'Parte del medio, en el idioma pedido.' },
            cierre: { ...TEXTO, description: 'Frase final, en el idioma pedido.' },
            texto: { ...TEXTO, description: 'Todo lo que dice, de corrido: gancho + desarrollo + cierre.' },
            gestos: { ...TEXTO, description: 'Microgestos y acciones, en inglés.' },
            caption: { ...TEXTO, description: 'Texto para publicar con 3-5 hashtags, en el idioma pedido.' },
            traduccion: { ...TEXTO, description: 'Traducción al español rioplatense de todo el texto que dice.' },
          },
        },
      },
    },
  },
};

/** 3 guiones (storytime, opinión, consejo; o reseña, problema, hallazgo si es UGC de producto) con gancho, desarrollo y cierre. */
export async function POST(request: Request) {
  const b = (await request.json().catch(() => null)) as { tema?: string; idioma?: string; dur?: number; nombre?: string; escenario?: string; extra?: string; ugc?: boolean } | null;
  const tema = typeof b?.tema === 'string' ? b.tema.trim().slice(0, 600) : '';
  if (!tema) return NextResponse.json({ error: 'Escribí de qué querés que hable.' }, { status: 400 });
  const idioma = typeof b?.idioma === 'string' && b.idioma.trim() ? b.idioma.trim().slice(0, 300) : 'English (US), casual';
  const dur = Math.min(15, Math.max(4, Number(b?.dur) || 10));
  const escenario = typeof b?.escenario === 'string' ? b.escenario.trim().slice(0, 300) : '';
  const nombre = typeof b?.nombre === 'string' ? b.nombre.trim().slice(0, 60) : '';
  const extra = typeof b?.extra === 'string' ? b.extra.trim().slice(0, 400) : '';

  // Las cuentas necesitan saldo (la IA de texto cobra muy poco; se descuenta lo que informa Kie).
  const permiso = await puedeGastar(TEXTO_ESTIMADO);
  if (!permiso.ok) return NextResponse.json({ error: permiso.error }, { status: permiso.status });
  const r = await pedirDatos(pedidoGuiones({ tema, idioma, dur, nombre, escenario, extra, ugc: b?.ugc === true }), HERRAMIENTA);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 });
  await cobrarAhora(permiso, r.credits);
  const guiones = limpiarGuiones(r.datos);
  if (!guiones.length) return NextResponse.json({ error: 'La IA no devolvió guiones. Probá de nuevo.' }, { status: 502 });
  return NextResponse.json({ guiones, credits: typeof r.credits === 'number' ? r.credits * permiso.mult : undefined });
}
