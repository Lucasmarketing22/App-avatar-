import { NextResponse } from 'next/server';

import { origenDe } from '@/lib/mcp/oauth';

/** Metadatos del conector (RFC 9728): dónde se inicia sesión para usar /api/mcp. */
export function GET(request: Request) {
  const o = origenDe(request);
  return NextResponse.json({ resource: `${o}/api/mcp`, authorization_servers: [o], scopes_supported: ['musa'], bearer_methods_supported: ['header'] });
}
