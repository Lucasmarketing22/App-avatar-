import { NextResponse } from 'next/server';

import { SESSION_COOKIE, crearToken } from '@/lib/auth';
import { cuentaVigente, leerFirmado, origenDe } from '@/lib/mcp/oauth';

export const runtime = 'nodejs';
// Editar un video puede tardar un par de minutos.
export const maxDuration = 300;

/**
 * Conector de Claude (MCP por HTTP, sin sesiones guardadas). Claude entra con
 * el token de /api/oauth/token y cada herramienta usa las mismas rutas de la
 * app con la cuenta de ese token: mismos precios, saldo y Galería.
 * Todo lo que gasta créditos se pide dos veces: sin `confirmar` devuelve el
 * costo, y recién con `confirmar: true` lo crea.
 */
const VERSIONES = ['2025-06-18', '2025-03-26', '2024-11-05'];
const USD = (c: number) => `US$ ${(Math.round(c * 0.5) / 100).toFixed(2).replace('.', ',')}`;
const cred = (c: number) => Math.round(c).toLocaleString('es-AR');
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Ctx = { origen: string; cookie: string };
type Res = { texto: string; error?: boolean };

async function api(ctx: Ctx, ruta: string, cuerpo?: unknown): Promise<{ ok: boolean; status: number; d: Record<string, unknown> }> {
  try {
    const r = await fetch(`${ctx.origen}${ruta}`, {
      method: cuerpo === undefined ? 'GET' : 'POST',
      headers: { cookie: ctx.cookie, ...(cuerpo === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      cache: 'no-store',
    });
    return { ok: r.ok, status: r.status, d: ((await r.json().catch(() => ({}))) ?? {}) as Record<string, unknown> };
  } catch {
    return { ok: false, status: 502, d: { error: 'No se pudo conectar con la app.' } };
  }
}

const err = (d: Record<string, unknown>, def: string): Res => ({ texto: typeof d.error === 'string' ? d.error : def, error: true });

/* ---------- Herramientas ---------- */

const ROLES = ['a', 'b', 'c', 'lugar', 'ropa', 'objeto'];
const HERRAMIENTAS = [
  {
    name: 'ver_saldo',
    description: 'Muestra el saldo de créditos de la cuenta en musa.studio (1 crédito = US$ 0,005).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'ver_galeria',
    description: 'Lista las últimas fotos o videos de la Galería, con su URL (sirven como referencia para crear o para editar). Los videos se borran a los 2 días.',
    inputSchema: { type: 'object', properties: { tipo: { type: 'string', enum: ['fotos', 'videos'] }, cantidad: { type: 'integer', minimum: 1, maximum: 30, default: 10 } }, required: ['tipo'] },
  },
  {
    name: 'ver_personajes',
    description: 'Lista los personajes guardados (nombre y fotos de referencia de la cara/cuerpo).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'crear_foto',
    description: 'Crea una foto con Seedream 4.5 a partir de un texto y fotos de referencia (URLs de la Galería o de un personaje). Llamala primero SIN confirmar para saber el costo, preguntale al usuario y recién después llamala con confirmar: true. Espera hasta ~1 minuto el resultado.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Qué foto crear, en inglés, con todo el detalle.' },
        referencias: { type: 'array', items: { type: 'string' }, maxItems: 8, description: 'URLs de fotos de referencia (la cara primero).' },
        formato: { type: 'string', enum: ['9:16', '3:4', '1:1', '4:3', '16:9'], default: '9:16' },
        confirmar: { type: 'boolean', description: 'true solo después de que el usuario aprobó el costo.' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'crear_escena',
    description: 'Crea un video con Seedance 2.5 (Escenas): personas que hablan con voz y sonido, a partir de fotos de referencia y la descripción de la escena con los diálogos (en inglés, usando Person A / Person B). Borrador = 480p barato que después se puede pasar a 1080p. Llamala primero SIN confirmar para saber el costo y preguntale al usuario. Devuelve un id: el video tarda 5–15 minutos, consultalo con ver_estado.',
    inputSchema: {
      type: 'object',
      properties: {
        texto: { type: 'string', description: 'La escena: cómo se filma, dónde, qué pasa y quién dice qué.' },
        referencias: {
          type: 'array', minItems: 1, maxItems: 9,
          items: { type: 'object', properties: { url: { type: 'string' }, rol: { type: 'string', enum: ROLES, description: 'a/b/c = Persona A/B/C, lugar, ropa u objeto.' } }, required: ['url', 'rol'] },
        },
        duracion: { type: 'integer', minimum: 4, maximum: 30, default: 15 },
        calidad: { type: 'string', enum: ['borrador', '720p', '1080p'], default: 'borrador' },
        formato: { type: 'string', enum: ['9:16', '16:9'], default: '9:16' },
        confirmar: { type: 'boolean' },
      },
      required: ['texto', 'referencias'],
    },
  },
  {
    name: 'ver_estado',
    description: 'En qué va una foto o video que se está creando (con el id que devolvió crear_foto o crear_escena). Si terminó, da la URL.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'editar_video',
    description: 'Edición automática de un video de la Galería: corta las pausas, agrega acercamientos en los cortes y subtítulos en español rioplatense con la palabra clave en color. Llamala primero SIN confirmar para saber el costo. Tarda 1–3 minutos; si no termina, devuelve un id para ver_edicion.',
    inputSchema: { type: 'object', properties: { url: { type: 'string', description: 'URL del video (de ver_galeria).' }, confirmar: { type: 'boolean' } }, required: ['url'] },
  },
  {
    name: 'ver_edicion',
    description: 'Sigue una edición automática empezada con editar_video (con su id) y devuelve el video cuando está listo.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
];

/** Costo por segundo de Seedance 2.5 (créditos de Kie): igual que la pantalla de Escenas. */
const SEG: Record<string, number> = { borrador: 28, '720p': 63, '1080p': 158 };

async function seguirEdicion(ctx: Ctx, id: string, hasta: number): Promise<Res> {
  let e = (await api(ctx, `/api/editar?id=${encodeURIComponent(id)}`)).d;
  while (e.estado === 'escuchando' && Date.now() < hasta - 100000) { await dormir(4000); e = (await api(ctx, `/api/editar?id=${encodeURIComponent(id)}`)).d; }
  if (e.estado === 'transcripto') e = (await api(ctx, '/api/editar', { id, accion: 'armar' })).d;
  if (e.estado === 'listo') return { texto: `✅ Video editado (también está en la Galería, se borra a los 2 días): ${e.resultado}` };
  if (e.estado === 'fallo') return err(e, 'No se pudo editar.');
  if (typeof e.error === 'string') return err(e, '');
  return { texto: `Todavía se está editando. Consultalo en un minuto con ver_edicion (id: ${id}).` };
}

async function ejecutar(ctx: Ctx, nombre: string, a: Record<string, unknown>): Promise<Res> {
  const t0 = Date.now();
  switch (nombre) {
    case 'ver_saldo': {
      const r = await api(ctx, '/api/saldo');
      if (!r.ok) return err(r.d, 'No se pudo leer el saldo.');
      const c = Number(r.d.credits) || 0;
      return { texto: `Saldo: ${cred(c)} créditos (≈ ${USD(c)}).${r.d.admin ? ' (Es el saldo de Kie de la cuenta administradora.)' : ''}` };
    }
    case 'ver_galeria': {
      const videos = a.tipo === 'videos';
      const r = await api(ctx, videos ? '/api/videos' : '/api/creaciones');
      if (!r.ok) return err(r.d, 'No se pudo leer la Galería.');
      const items = (Array.isArray(r.d.items) ? r.d.items : []) as { url: string; ts: number; prompt?: string }[];
      const n = Math.min(30, Math.max(1, Number(a.cantidad) || 10));
      if (!items.length) return { texto: videos ? 'No hay videos en la Galería.' : 'No hay fotos en la Galería.' };
      return { texto: items.slice(0, n).map((x, i) => `${i + 1}. ${x.url} · ${new Date(x.ts).toISOString().slice(0, 16).replace('T', ' ')} UTC${x.prompt ? ` · "${String(x.prompt).slice(0, 120)}"` : ''}`).join('\n') };
    }
    case 'ver_personajes': {
      const r = await api(ctx, '/api/personaje');
      if (!r.ok) return err(r.d, 'No se pudieron leer los personajes.');
      const lista = (Array.isArray(r.d.lista) ? r.d.lista : []) as { nombre?: string; refs?: string[] }[];
      if (!lista.length) return { texto: 'No hay personajes guardados.' };
      return { texto: lista.map((p) => `• ${p.nombre || 'Sin nombre'}:\n${(p.refs ?? []).map((u) => `   ${u}`).join('\n') || '   (sin fotos)'}`).join('\n') };
    }
    case 'crear_foto': {
      const prompt = typeof a.prompt === 'string' ? a.prompt.trim() : '';
      if (!prompt) return { texto: 'Falta el prompt.', error: true };
      const refs = Array.isArray(a.referencias) ? a.referencias.filter((u): u is string => typeof u === 'string' && u.startsWith('https://')).slice(0, 8) : [];
      if (!a.confirmar) {
        const s = await api(ctx, '/api/saldo');
        const costos = (s.d.costos ?? {}) as Record<string, { credits?: number }>;
        const ultimo = Object.entries(costos).find(([k]) => k.startsWith('seedream/4.5-edit|'))?.[1]?.credits;
        return { texto: `Crear esta foto con Seedream 4.5 cuesta ${typeof ultimo === 'number' ? `≈ ${cred(ultimo)} créditos (${USD(ultimo)}), según la última foto` : 'unos pocos créditos (todavía no hay una foto anterior para calcularlo exacto)'}. Saldo actual: ${cred(Number(s.d.credits) || 0)} créditos. Preguntale al usuario y, si aprueba, llamá de nuevo con confirmar: true.` };
      }
      const r = await api(ctx, '/api/generate', { prompt, imageUrls: refs, aspect: typeof a.formato === 'string' ? a.formato : '9:16', modelo: 'seedream' });
      if (!r.ok || typeof r.d.taskId !== 'string') return err(r.d, 'No se pudo crear la foto.');
      const id = r.d.taskId;
      while (Date.now() - t0 < 75000) {
        await dormir(4000);
        const e = (await api(ctx, `/api/status?taskId=${encodeURIComponent(id)}`)).d;
        if (e.state === 'success') return { texto: `✅ Foto lista (ya está en la Galería): ${e.url}` };
        if (e.state === 'fail') return err(e, 'La IA no pudo crear la foto.');
      }
      return { texto: `La foto se está creando. Consultala con ver_estado (id: ${id}).` };
    }
    case 'crear_escena': {
      const refs = (Array.isArray(a.referencias) ? a.referencias : []) as { url?: string; rol?: string }[];
      const dur = Math.round(Number(a.duracion) || 15);
      const calidad = a.calidad === '720p' || a.calidad === '1080p' ? a.calidad : 'borrador';
      if (!a.confirmar) {
        const [s, esc] = await Promise.all([api(ctx, '/api/saldo'), api(ctx, '/api/escena')]);
        const mult = Number(s.d.mult) || 1;
        const porSeg = calidad === '720p' && esc.d.replicate ? 0.2312 / 0.005 : SEG[calidad];
        const c = porSeg * dur * mult;
        return { texto: `Esta escena (${dur} s, ${calidad === 'borrador' ? 'borrador 480p' : calidad}) cuesta ≈ ${cred(c)} créditos (${USD(c)}). Saldo actual: ${cred(Number(s.d.credits) || 0)} créditos. Preguntale al usuario y, si aprueba, llamá de nuevo con confirmar: true.` };
      }
      const r = await api(ctx, '/api/escena', { refs, texto: a.texto, dur, calidad, formato: a.formato === '16:9' ? '16:9' : '9:16' });
      if (!r.ok || typeof r.d.taskId !== 'string') return err(r.d, 'No se pudo crear la escena.');
      return { texto: `🎬 Escena en camino${r.d.aviso ? ` (${r.d.aviso})` : ''}. Tarda 5–15 minutos. Consultala con ver_estado (id: ${r.d.taskId}). También va a aparecer sola en la Galería.` };
    }
    case 'ver_estado': {
      const id = typeof a.id === 'string' ? a.id : '';
      if (!id) return { texto: 'Falta el id.', error: true };
      const e = (await api(ctx, `/api/status?taskId=${encodeURIComponent(id)}`)).d;
      if (e.state === 'success') return { texto: `✅ Listo: ${e.url}${typeof e.credits === 'number' ? ` · costó ${cred(e.credits)} créditos` : ''}` };
      if (e.state === 'fail') return err(e, 'No se pudo crear.');
      return { texto: 'Todavía se está creando. Volvé a consultar en un par de minutos.' };
    }
    case 'editar_video': {
      const url = typeof a.url === 'string' ? a.url : '';
      if (!url) return { texto: 'Falta la URL del video.', error: true };
      if (!a.confirmar) {
        const c = Number((await api(ctx, '/api/editar')).d.costo) || 0;
        return { texto: `La edición automática cuesta ≈ ${cred(c)} créditos (${USD(c)}), aproximado: al terminar se cobra lo real. Preguntale al usuario y, si aprueba, llamá de nuevo con confirmar: true.` };
      }
      const r = await api(ctx, '/api/editar', { url });
      if (!r.ok || typeof r.d.id !== 'string') return err(r.d, 'No se pudo empezar la edición.');
      return seguirEdicion(ctx, r.d.id, t0 + 280000);
    }
    case 'ver_edicion': {
      const id = typeof a.id === 'string' ? a.id : '';
      if (!id) return { texto: 'Falta el id.', error: true };
      return seguirEdicion(ctx, id, t0 + 280000);
    }
    default:
      return { texto: `No existe la herramienta ${nombre}.`, error: true };
  }
}

/* ---------- Protocolo (JSON-RPC) ---------- */

type Mensaje = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

async function responder(m: Mensaje, ctx: Ctx): Promise<Record<string, unknown> | null> {
  if (m.id === undefined || m.id === null) return null; // notificaciones: sin respuesta
  const ok = (result: unknown) => ({ jsonrpc: '2.0', id: m.id, result });
  switch (m.method) {
    case 'initialize': {
      const pedida = String(m.params?.protocolVersion ?? '');
      return ok({
        protocolVersion: VERSIONES.includes(pedida) ? pedida : VERSIONES[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'musa.studio', version: '1.0.0' },
        instructions: 'App de musa.studio para crear contenido UGC con IA. Antes de cualquier acción que gaste créditos (crear_foto, crear_escena, editar_video) llamá sin confirmar, mostrale el costo al usuario y esperá su aprobación.',
      });
    }
    case 'ping': return ok({});
    case 'tools/list': return ok({ tools: HERRAMIENTAS });
    case 'tools/call': {
      const nombre = String(m.params?.name ?? '');
      const args = (m.params?.arguments ?? {}) as Record<string, unknown>;
      const r = await ejecutar(ctx, nombre, args).catch(() => ({ texto: 'Algo falló en la app. Probá de nuevo.', error: true }));
      return ok({ content: [{ type: 'text', text: r.texto }], isError: !!r.error });
    }
    default:
      return { jsonrpc: '2.0', id: m.id, error: { code: -32601, message: `Método no soportado: ${m.method}` } };
  }
}

function noAutorizado(request: Request) {
  return NextResponse.json({ error: 'invalid_token' }, {
    status: 401,
    headers: { 'WWW-Authenticate': `Bearer resource_metadata="${origenDe(request)}/.well-known/oauth-protected-resource"` },
  });
}

export async function POST(request: Request) {
  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const acc = await leerFirmado(token, 'acc');
  if (!acc || !(await cuentaVigente(acc.c, acc.v))) return noAutorizado(request);
  const secreto = process.env.APP_PASSWORD ?? '';
  const ctx: Ctx = { origen: origenDe(request), cookie: `${SESSION_COOKIE}=${await crearToken(acc.c, acc.v, secreto)}` };

  const cuerpo = (await request.json().catch(() => null)) as Mensaje | Mensaje[] | null;
  if (!cuerpo) return NextResponse.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON inválido.' } }, { status: 400 });
  if (Array.isArray(cuerpo)) {
    const rs = (await Promise.all(cuerpo.map((m) => responder(m, ctx)))).filter(Boolean);
    return rs.length ? NextResponse.json(rs) : new Response(null, { status: 202 });
  }
  const r = await responder(cuerpo, ctx);
  return r ? NextResponse.json(r) : new Response(null, { status: 202 });
}

/** Sin sesiones ni avisos del servidor: GET y DELETE no se usan. */
export function GET() {
  return new Response(null, { status: 405, headers: { Allow: 'POST' } });
}
export function DELETE() {
  return new Response(null, { status: 405, headers: { Allow: 'POST' } });
}
