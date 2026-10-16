import { NextResponse } from 'next/server';

import { pedirDatos } from '@/lib/ia/texto';
import { cobrarAhora, puedeGastar, TEXTO_ESTIMADO } from '@/lib/saldo';

export const runtime = 'nodejs';
export const maxDuration = 60;

const HERRAMIENTA = {
  name: 'entregar_traduccion',
  description: 'Entrega la traducción.',
  input_schema: { type: 'object', required: ['traduccion'], properties: { traduccion: { type: 'string', description: 'El texto traducido al español rioplatense.' } } },
};

/** Traduce al español lo que va a decir la modelo (cuando se edita el guion a mano). */
export async function POST(request: Request) {
  const b = (await request.json().catch(() => null)) as { texto?: string } | null;
  const texto = typeof b?.texto === 'string' ? b.texto.trim().slice(0, 1500) : '';
  if (!texto) return NextResponse.json({ error: 'No hay texto para traducir.' }, { status: 400 });
  // Las cuentas necesitan saldo (la IA de texto cobra muy poco; se descuenta lo que informa Kie).
  const permiso = await puedeGastar(TEXTO_ESTIMADO);
  if (!permiso.ok) return NextResponse.json({ error: permiso.error }, { status: permiso.status });
  const r = await pedirDatos(
    `Translate this spoken line into natural Rioplatense Spanish (Argentina), faithfully, keeping the tone. If it is already in Spanish, return it unchanged.\n\n"${texto}"\n\nAnswer by calling the tool entregar_traduccion. If you cannot call tools, answer ONLY with the JSON object {"traduccion": "..."} and no other text.`,
    HERRAMIENTA,
  );
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 });
  await cobrarAhora(permiso, r.credits);
  const t = (r.datos as { traduccion?: unknown })?.traduccion;
  if (typeof t !== 'string' || !t.trim()) return NextResponse.json({ error: 'No se pudo traducir. Probá de nuevo.' }, { status: 502 });
  return NextResponse.json({ traduccion: t.trim().slice(0, 1500) });
}
