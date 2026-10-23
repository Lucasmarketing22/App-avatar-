import { cookies } from 'next/headers';

import { CUENTA_ADMIN, SESSION_COOKIE, leerToken } from '@/lib/auth';
import { normalizarUsuario, verificarClave } from '@/lib/cuentas';
import { firmar, leerFirmado, redirectPermitido } from '@/lib/mcp/oauth';

export const runtime = 'nodejs';

/**
 * Pantalla para conectar Claude con la app: la persona entra con su usuario y
 * contraseña (o, si ya entró a la app en este navegador, solo toca "Permitir")
 * y Claude recibe un código para pedir sus tokens.
 */
type Pedido = { client_id: string; redirect_uri: string; state: string; code_challenge: string; code_challenge_method: string };

const escapar = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

async function validar(p: Partial<Pedido>): Promise<string | null> {
  const cli = await leerFirmado(p.client_id, 'cli');
  if (!cli) return 'Este conector no está registrado. Volvé a agregarlo en Claude.';
  if (!p.redirect_uri || !redirectPermitido(p.redirect_uri) || !cli.ru.includes(p.redirect_uri)) return 'La dirección de regreso no es válida.';
  if (!p.code_challenge || (p.code_challenge_method ?? 'S256') !== 'S256') return 'Falta la verificación PKCE (S256).';
  return null;
}

async function sesionActual(): Promise<{ cuenta: string; version: number } | null> {
  const secreto = process.env.APP_PASSWORD;
  return secreto ? leerToken(cookies().get(SESSION_COOKIE)?.value, secreto) : null;
}

function pagina(p: Pedido, opciones: { sesion?: string; error?: string }): Response {
  const ocultos = (Object.keys(p) as (keyof Pedido)[]).map((k) => `<input type="hidden" name="${k}" value="${escapar(p[k] ?? '')}">`).join('');
  const quien = opciones.sesion ? (opciones.sesion === CUENTA_ADMIN ? 'el administrador' : opciones.sesion) : '';
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Conectar Claude · musa.studio</title>
<style>
:root{--rosa:#ff5fa2;--violeta:#a77bff;--fondo:#f3eef0;--texto:#1d1418;--gris:#6f6570}
@media (prefers-color-scheme:dark){:root{--fondo:#151015;--texto:#f5eef2;--gris:#a99fa8}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--fondo);color:var(--texto);font:16px/1.45 system-ui,-apple-system,sans-serif;padding:16px}
.c{width:100%;max-width:380px;background:rgba(255,255,255,.06);border:1px solid rgba(127,127,127,.25);border-radius:20px;padding:24px}
h1{font-size:22px;margin:0 0 6px}.m{font-weight:800}.m span{background:linear-gradient(110deg,var(--rosa),var(--violeta));-webkit-background-clip:text;background-clip:text;color:transparent}
p{color:var(--gris);margin:0 0 16px}label{display:block;font-size:14px;font-weight:600;margin:12px 0 6px}
input[type=text],input[type=password]{width:100%;font-size:16px;padding:12px 14px;border-radius:12px;border:1px solid rgba(127,127,127,.4);background:transparent;color:inherit}
button{margin-top:18px;width:100%;border:0;border-radius:999px;padding:14px;font-size:16px;font-weight:700;color:#fff;background:linear-gradient(135deg,var(--rosa),var(--violeta));cursor:pointer}
.e{background:#ffe3ea;color:#8a1335;border-radius:12px;padding:10px 12px;font-size:14px;margin:0 0 12px}.n{font-size:13px;margin-top:14px}
</style></head><body><form class="c" method="post">
<div class="m">musa<span>.studio</span></div>
<h1>Conectar Claude</h1>
<p>Claude va a poder ver tu saldo y tu galería, y crear fotos, escenas y ediciones con tu cuenta. Antes de gastar créditos siempre te pregunta.</p>
${opciones.error ? `<div class="e">${escapar(opciones.error)}</div>` : ''}
${quien
    ? `<p>Entraste como <b>${escapar(quien)}</b>.</p><input type="hidden" name="usar_sesion" value="1">`
    : `<label for="u">Usuario <span style="font-weight:400">(vacío si sos el administrador)</span></label><input id="u" type="text" name="usuario" autocomplete="username" autocapitalize="none">
<label for="c">Contraseña</label><input id="c" type="password" name="password" autocomplete="current-password" required>`}
${ocultos}
<button type="submit">Permitir</button>
<p class="n">Podés desconectarlo cuando quieras desde Claude (Configuración → Conectores).</p>
</form></body></html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY' } });
}

const textoPlano = (msg: string, status = 400) => new Response(msg, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const p: Pedido = {
    client_id: q.get('client_id') ?? '', redirect_uri: q.get('redirect_uri') ?? '', state: q.get('state') ?? '',
    code_challenge: q.get('code_challenge') ?? '', code_challenge_method: q.get('code_challenge_method') ?? 'S256',
  };
  if (q.get('response_type') !== 'code') return textoPlano('Pedido inválido (response_type).');
  const mal = await validar(p);
  if (mal) return textoPlano(mal);
  const s = await sesionActual();
  return pagina(p, { sesion: s?.cuenta });
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(request: Request) {
  const f = new URLSearchParams(await request.text());
  const p: Pedido = {
    client_id: f.get('client_id') ?? '', redirect_uri: f.get('redirect_uri') ?? '', state: f.get('state') ?? '',
    code_challenge: f.get('code_challenge') ?? '', code_challenge_method: f.get('code_challenge_method') ?? 'S256',
  };
  const mal = await validar(p);
  if (mal) return textoPlano(mal);
  const secreto = process.env.APP_PASSWORD;
  if (!secreto) return textoPlano('La app no tiene contraseña configurada.', 500);

  // Con la sesión de la app (la cookie no viaja desde otros sitios) o con usuario y contraseña.
  let cuenta: { id: string; version: number } | null = null;
  const s = f.get('usar_sesion') ? await sesionActual() : null;
  if (s) cuenta = { id: s.cuenta, version: s.version };
  else {
    const usuario = normalizarUsuario(f.get('usuario') ?? '');
    const clave = f.get('password') ?? '';
    if (!usuario || usuario === CUENTA_ADMIN) { if (clave === secreto) cuenta = { id: CUENTA_ADMIN, version: 0 }; }
    else { const c = await verificarClave(usuario, clave); if (c) cuenta = { id: c.id, version: c.version }; }
  }
  if (!cuenta) {
    await esperar(600);
    return pagina(p, { error: 'Usuario o contraseña incorrectos (o la cuenta está pausada).' });
  }
  const code = await firmar({ t: 'code', c: cuenta.id, v: cuenta.version, cc: p.code_challenge, ru: p.redirect_uri, ci: p.client_id, exp: Math.floor(Date.now() / 1000) + 300 });
  const destino = new URL(p.redirect_uri);
  destino.searchParams.set('code', code);
  if (p.state) destino.searchParams.set('state', p.state);
  return new Response(null, { status: 302, headers: { Location: destino.toString(), 'Cache-Control': 'no-store' } });
}
