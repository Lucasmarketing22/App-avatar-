import { NextResponse } from 'next/server';

import { origenDe } from '@/lib/mcp/oauth';

/** Metadatos del inicio de sesión (RFC 8414) para el conector de Claude. */
export function GET(request: Request) {
  const o = origenDe(request);
  return NextResponse.json({
    issuer: o,
    authorization_endpoint: `${o}/api/oauth/authorize`,
    token_endpoint: `${o}/api/oauth/token`,
    registration_endpoint: `${o}/api/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: ['musa'],
  });
}
