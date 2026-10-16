import 'server-only';

/**
 * IA de texto (Claude) a través de Kie: misma clave KIE_API_KEY, se cobra en
 * créditos de Kie. Endpoint verificado en docs.kie.ai (Chat Models › Claude):
 *  POST https://api.kie.ai/claude/v1/messages  { model, messages, tools, max_tokens }
 */
const URL_CLAUDE = 'https://api.kie.ai/claude/v1/messages';
const MODELO = 'claude-sonnet-5-5';

type Herramienta = { name: string; description: string; input_schema: Record<string, unknown> };
type Bloque = { type?: string; text?: string; name?: string; input?: unknown };

type Intento = { ok: true; datos: unknown; credits?: number } | { ok: false; error: string; reintentar: boolean; definitivo: boolean };
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Mensaje de Kie tal cual + su código, para saber la causa real. */
const deKie = (msg: string | undefined, code: number | undefined) => (msg ? `Kie respondió: "${msg}"${code ? ` (código ${code})` : ''}.` : code ? `Kie respondió con el código ${code}.` : '');

/** Un pedido a Claude que responde llamando a una herramienta (así la respuesta llega ordenada). */
async function intentarClaude(pedido: string, herramienta: Herramienta): Promise<Intento> {
  let res: Response;
  try {
    res = await fetch(URL_CLAUDE, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.KIE_API_KEY}`, 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ model: MODELO, max_tokens: 3000, stream: false, thinkingFlag: false, messages: [{ role: 'user', content: pedido }], tools: [herramienta] }),
    });
  } catch {
    return { ok: false, error: 'No se pudo conectar con Kie.', reintentar: true, definitivo: false };
  }
  type Resp = { code?: number; msg?: string; content?: Bloque[]; credits_consumed?: number; error?: { message?: string }; data?: { content?: Bloque[]; credits_consumed?: number } };
  const crudo = await res.text().catch(() => '');
  let d: Resp | null = null;
  try { d = JSON.parse(crudo) as Resp; } catch { d = leerSSE(crudo); }
  // Algunas respuestas vienen envueltas en { code, data: {...} }.
  if (d && !Array.isArray(d.content) && Array.isArray(d.data?.content)) d = { ...d, content: d.data!.content, credits_consumed: d.data!.credits_consumed ?? d.credits_consumed };
  const code = typeof d?.code === 'number' && d.code !== 200 ? d.code : res.ok ? undefined : res.status;
  const msg = d?.msg || d?.error?.message;
  if (code === 401 || code === 403) return { ok: false, error: `La clave de Kie no es válida. ${deKie(msg, code)}`, reintentar: false, definitivo: true };
  if (code === 402) return { ok: false, error: `Te quedaste sin crédito en Kie. Cargá saldo y reintentá. ${deKie(msg, code)}`, reintentar: false, definitivo: true };
  if (code || !Array.isArray(d?.content)) {
    return { ok: false, error: deKie(msg, code) || 'La IA de texto no respondió.', reintentar: !code || code === 429 || code >= 500, definitivo: false };
  }
  const credits = typeof d!.credits_consumed === 'number' ? d!.credits_consumed : undefined;
  const contenido = d!.content!;
  const uso = contenido.find((b) => b.type === 'tool_use' && b.name === herramienta.name) ?? contenido.find((b) => b.type === 'tool_use');
  if (uso?.input) {
    if (typeof uso.input !== 'string') return { ok: true, datos: uso.input, credits };
    try { return { ok: true, datos: JSON.parse(uso.input), credits }; } catch { /* sigue */ }
  }
  const datos = jsonDe(contenido.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n'));
  if (datos !== null) return { ok: true, datos, credits };
  return { ok: false, error: 'La IA no devolvió el resultado en el formato esperado.', reintentar: true, definitivo: false };
}

/** Busca el primer objeto JSON dentro de un texto. */
function jsonDe(texto: string): unknown {
  const m = texto.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

/** Plan B: Gemini 3.5 Flash (también en Kie) devolviendo solo JSON. */
async function intentarGemini(pedido: string, herramienta: Herramienta): Promise<Intento> {
  const r = await chatGemini([{ type: 'text', text: `${pedido}\n\nIMPORTANT: answer ONLY with one JSON object that matches this JSON schema (no tool call, no markdown, no other text):\n${JSON.stringify(herramienta.input_schema)}` }]);
  if (!r.ok) return { ok: false, error: r.error, reintentar: false, definitivo: false };
  const datos = jsonDe(r.texto);
  return datos !== null ? { ok: true, datos, credits: r.credits } : { ok: false, error: 'La IA de respaldo no devolvió el formato esperado.', reintentar: false, definitivo: false };
}

/**
 * Pide datos ordenados a la IA de texto: Claude (hasta 3 intentos si Kie está
 * saturado o falla), y si no responde, Gemini Flash como respaldo. Si todo
 * falla, el error trae el mensaje original de Kie.
 */
export async function pedirDatos(pedido: string, herramienta: Herramienta): Promise<{ ok: true; datos: unknown; credits?: number } | { ok: false; error: string }> {
  if (!process.env.KIE_API_KEY) return { ok: false, error: 'Falta configurar la clave de Kie (KIE_API_KEY).' };
  // El pedido tiene ~60 s en el servidor: los reintentos solo si queda tiempo.
  const t0 = Date.now();
  let ultimo: Intento | null = null;
  for (let i = 0; i < 3; i++) {
    if (i && Date.now() - t0 > 20000) break;
    if (i) await dormir(i * 2500);
    ultimo = await intentarClaude(pedido, herramienta);
    if (ultimo.ok) return ultimo;
    if (ultimo.definitivo || !ultimo.reintentar) break;
  }
  if (ultimo && !ultimo.ok && ultimo.definitivo) return { ok: false, error: ultimo.error };
  if (Date.now() - t0 > 40000) return { ok: false, error: `La IA de texto tardó demasiado. ${ultimo && !ultimo.ok ? ultimo.error : ''} Probá de nuevo.` };
  const plan = await intentarGemini(pedido, herramienta);
  if (plan.ok) return plan;
  const errClaude = ultimo && !ultimo.ok ? ultimo.error : '';
  return { ok: false, error: `No se pudo escribir con la IA de texto. Claude: ${errClaude || 'sin respuesta'} Respaldo: ${plan.error}` };
}

/** Por si la respuesta llega como eventos (stream): junta el texto y las herramientas. */
function leerSSE(crudo: string): { content: Bloque[] } | null {
  if (!crudo.includes('data:')) return null;
  const bloques: Bloque[] = [];
  const parciales: Record<number, string> = {};
  for (const linea of crudo.split('\n')) {
    if (!linea.startsWith('data:')) continue;
    try {
      const ev = JSON.parse(linea.slice(5).trim()) as { type?: string; index?: number; content_block?: Bloque; delta?: { type?: string; text?: string; partial_json?: string } };
      const i = ev.index ?? 0;
      if (ev.type === 'content_block_start' && ev.content_block) { bloques[i] = { ...ev.content_block }; parciales[i] = ''; }
      if (ev.type === 'content_block_delta' && ev.delta) {
        if (ev.delta.type === 'text_delta') bloques[i] = { ...(bloques[i] ?? { type: 'text' }), text: (bloques[i]?.text ?? '') + (ev.delta.text ?? '') };
        if (ev.delta.type === 'input_json_delta') parciales[i] = (parciales[i] ?? '') + (ev.delta.partial_json ?? '');
      }
    } catch { /* línea incompleta */ }
  }
  for (const [i, j] of Object.entries(parciales)) {
    const b = bloques[Number(i)];
    if (b?.type === 'tool_use' && j) { try { b.input = JSON.parse(j); } catch { /* */ } }
  }
  const content = bloques.filter(Boolean);
  return content.length ? { content } : null;
}

/**
 * Mirar una imagen y describirla (Gemini 3.5 Flash vía Kie, misma clave).
 * Endpoint verificado en docs.kie.ai: POST /gemini-3-5-flash-openai/v1/chat/completions
 * con formato OpenAI; las imágenes van como { type: 'image_url', image_url: { url } }.
 */
export async function verImagen(url: string, pedido: string): Promise<{ ok: true; texto: string; credits?: number } | { ok: false; error: string }> {
  return chatGemini([{ type: 'text', text: pedido }, { type: 'image_url', image_url: { url } }]);
}

/** Un mensaje a Gemini 3.5 Flash (formato OpenAI). Reintenta si Kie está saturado. */
async function chatGemini(contenido: unknown[]): Promise<{ ok: true; texto: string; credits?: number } | { ok: false; error: string }> {
  if (!process.env.KIE_API_KEY) return { ok: false, error: 'Falta configurar la clave de Kie (KIE_API_KEY).' };
  let error = '';
  for (let i = 0; i < 2; i++) {
    if (i) await dormir(2500);
    try {
      const res = await fetch('https://api.kie.ai/gemini-3-5-flash-openai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.KIE_API_KEY}`, 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ stream: false, messages: [{ role: 'user', content: contenido }] }),
      });
      const d = (await res.json().catch(() => null)) as { code?: number; msg?: string; credits_consumed?: number; choices?: { message?: { content?: unknown } }[] } | null;
      const c = d?.choices?.[0]?.message?.content;
      const texto = typeof c === 'string' ? c : Array.isArray(c) ? c.map((x) => (typeof x === 'object' && x && 'text' in x ? String((x as { text: unknown }).text) : '')).join(' ') : '';
      // Si Kie informa cuánto costó, se usa para cobrárselo a la cuenta.
      if (res.ok && texto.trim()) return { ok: true, texto: texto.trim(), credits: typeof d?.credits_consumed === 'number' ? d.credits_consumed : undefined };
      const code = typeof d?.code === 'number' && d.code !== 200 ? d.code : res.ok ? undefined : res.status;
      error = deKie(d?.msg, code) || 'No respondió.';
      if (code && code !== 429 && code < 500) break;
    } catch {
      error = 'No se pudo conectar con Kie.';
    }
  }
  return { ok: false, error };
}
