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

/**
 * Le pide a Claude que responda llamando a una herramienta (así la respuesta
 * llega ordenada). Si igual contesta en texto, se busca el JSON en el texto.
 */
export async function pedirDatos(pedido: string, herramienta: Herramienta): Promise<{ ok: true; datos: unknown; credits?: number } | { ok: false; error: string }> {
  if (!process.env.KIE_API_KEY) return { ok: false, error: 'Falta configurar la clave de Kie (KIE_API_KEY).' };
  let res: Response;
  try {
    res = await fetch(URL_CLAUDE, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.KIE_API_KEY}`, 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ model: MODELO, max_tokens: 3000, stream: false, messages: [{ role: 'user', content: pedido }], tools: [herramienta] }),
    });
  } catch {
    return { ok: false, error: 'No se pudo conectar con Kie. Probá de nuevo.' };
  }
  const d = (await res.json().catch(() => null)) as { code?: number; msg?: string; content?: Bloque[]; credits_consumed?: number; error?: { message?: string } } | null;
  if (res.status === 401 || res.status === 403 || d?.code === 401) return { ok: false, error: 'La clave de Kie no es válida.' };
  if (res.status === 402 || d?.code === 402) return { ok: false, error: 'Te quedaste sin crédito en Kie. Cargá saldo y reintentá.' };
  if (res.status === 429 || d?.code === 429) return { ok: false, error: 'Kie está recibiendo muchos pedidos. Esperá unos segundos y reintentá.' };
  if (!res.ok || !Array.isArray(d?.content)) {
    const msg = d?.msg || d?.error?.message;
    return { ok: false, error: msg ? `Kie devolvió un error: ${msg}` : 'La IA de texto no respondió. Probá de nuevo.' };
  }
  const credits = typeof d.credits_consumed === 'number' ? d.credits_consumed : undefined;
  const uso = d.content.find((b) => b.type === 'tool_use' && b.name === herramienta.name);
  if (uso?.input) return { ok: true, datos: uso.input, credits };
  const texto = d.content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n');
  const json = texto.match(/\{[\s\S]*\}/);
  if (json) {
    try { return { ok: true, datos: JSON.parse(json[0]), credits }; } catch { /* sigue */ }
  }
  return { ok: false, error: 'La IA no devolvió los guiones. Probá de nuevo.' };
}
