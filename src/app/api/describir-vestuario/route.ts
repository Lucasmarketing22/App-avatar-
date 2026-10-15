import { NextResponse } from 'next/server';

import { verImagen } from '@/lib/ia/texto';
import { readJson, writeJson } from '@/lib/storage';

export const runtime = 'nodejs';
export const maxDuration = 60;

const PEDIDO =
  'Describe ONLY the clothing and accessories in this image, so a fashion designer could recreate them exactly: every garment (type, cut, neckline, straps, sleeves, length, fit, fabric and texture), exact colors, the print or pattern described precisely, details (ties, slits, buttons, seams, cut-outs), shoes, jewelry and bag. ' +
  'Do NOT describe the person at all: no body, size, curves, bust, hips, height, skin, face, hair or pose, and no background. Write one paragraph in English, maximum 90 words, starting with the first garment.';

/**
 * La foto de vestuario NO va a la IA de imagen (copiaría también el cuerpo de
 * la persona que la tiene puesta). Una IA que mira la foto la convierte en una
 * descripción solo de la ropa, y eso es lo que se usa. Se guarda para no
 * pagarla dos veces.
 */
export async function POST(request: Request) {
  const b = (await request.json().catch(() => null)) as { url?: string } | null;
  const url = typeof b?.url === 'string' && b.url.startsWith('https://') ? b.url : '';
  if (!url) return NextResponse.json({ error: 'Falta la foto del vestuario.' }, { status: 400 });

  const guardadas = await readJson<Record<string, string>>('vestuarios-desc', {});
  if (guardadas[url]) return NextResponse.json({ descripcion: guardadas[url] });

  const r = await verImagen(url, PEDIDO);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 });
  const descripcion = r.texto.replace(/\s+/g, ' ').slice(0, 900);
  const claves = Object.keys(guardadas);
  const resto = claves.length > 400 ? Object.fromEntries(claves.slice(-300).map((k) => [k, guardadas[k]])) : guardadas;
  await writeJson('vestuarios-desc', { ...resto, [url]: descripcion }).catch(() => undefined);
  return NextResponse.json({ descripcion });
}
