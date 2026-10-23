import { NextResponse } from 'next/server';

import { firmar, redirectPermitido } from '@/lib/mcp/oauth';

export const runtime = 'nodejs';

/** Registro dinámico de clientes (RFC 7591): solo Claude (ver redirectPermitido). */
export async function POST(request: Request) {
  const b = (await request.json().catch(() => null)) as { redirect_uris?: unknown; client_name?: unknown } | null;
  const ru = Array.isArray(b?.redirect_uris) ? b!.redirect_uris.filter(redirectPermitido).slice(0, 5) : [];
  if (!ru.length) return NextResponse.json({ error: 'invalid_redirect_uri', error_description: 'Solo se puede conectar Claude.' }, { status: 400 });
  const nombre = typeof b?.client_name === 'string' ? b.client_name.slice(0, 60) : 'Claude';
  return NextResponse.json({
    client_id: await firmar({ t: 'cli', ru, n: nombre }),
    client_name: nombre,
    redirect_uris: ru,
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
  }, { status: 201 });
}
