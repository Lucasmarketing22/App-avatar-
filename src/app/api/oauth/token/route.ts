import { NextResponse } from 'next/server';

import { cuentaVigente, emitirTokens, leerFirmado, s256 } from '@/lib/mcp/oauth';

export const runtime = 'nodejs';

const error = (codigo: string, detalle: string) => NextResponse.json({ error: codigo, error_description: detalle }, { status: 400, headers: { 'Cache-Control': 'no-store' } });

/** Cambia el código (o el refresh_token) por los tokens del conector. */
export async function POST(request: Request) {
  const tipo = request.headers.get('content-type') ?? '';
  const p: Record<string, string> = tipo.includes('application/json')
    ? ((await request.json().catch(() => ({}))) as Record<string, string>)
    : Object.fromEntries(new URLSearchParams(await request.text()));

  if (p.grant_type === 'authorization_code') {
    const code = await leerFirmado(p.code, 'code');
    if (!code) return error('invalid_grant', 'El código venció o no es válido.');
    if (p.redirect_uri && p.redirect_uri !== code.ru) return error('invalid_grant', 'redirect_uri distinto.');
    if (p.client_id && p.client_id !== code.ci) return error('invalid_grant', 'client_id distinto.');
    if (!p.code_verifier || (await s256(p.code_verifier)) !== code.cc) return error('invalid_grant', 'PKCE no coincide.');
    if (!(await cuentaVigente(code.c, code.v))) return error('invalid_grant', 'La cuenta está pausada o cambió la contraseña.');
    return NextResponse.json(await emitirTokens(code.c, code.v), { headers: { 'Cache-Control': 'no-store' } });
  }
  if (p.grant_type === 'refresh_token') {
    const ref = await leerFirmado(p.refresh_token, 'ref');
    if (!ref || !(await cuentaVigente(ref.c, ref.v))) return error('invalid_grant', 'Volvé a conectar la app.');
    return NextResponse.json(await emitirTokens(ref.c, ref.v), { headers: { 'Cache-Control': 'no-store' } });
  }
  return error('unsupported_grant_type', 'Tipo de pedido no soportado.');
}
