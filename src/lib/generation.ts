import 'server-only';

import crypto from 'node:crypto';

import { createClient } from '@/lib/supabase/server';
import { getDecryptedApiKey } from '@/lib/api-keys';
import type { ApiKeyProvider, GenerationStatus } from '@/lib/database.types';

/**
 * Motor de generacion de imagenes. Se ejecuta SOLO en el servidor: descifra la
 * API key BYOK del usuario, llama al proveedor, descarga el resultado y lo
 * guarda en el bucket privado "generations", registrando todo en la tabla
 * generations.
 */

const BUCKET = 'generations';
const SIGNED_URL_TTL = 60 * 60; // 1 hora

/** Proveedores con generacion implementada (los demas se ofrecen "proximamente"). */
export const GENERATION_READY: Record<ApiKeyProvider, boolean> = {
  replicate: true,
  fal: false,
  higgsfield: false,
};

/** Modelo por defecto por proveedor. */
const DEFAULT_MODEL: Partial<Record<ApiKeyProvider, string>> = {
  replicate: 'black-forest-labs/flux-schnell',
};

type ProviderResult =
  | { ok: true; imageUrl: string; jobId: string | null; model: string }
  | { ok: false; error: string; jobId: string | null; model: string };

/**
 * Genera una imagen con Replicate usando la HTTP API con `Prefer: wait`
 * (bloquea hasta que la prediccion termina, hasta ~60s).
 */
async function generateWithReplicate(
  apiKey: string,
  prompt: string,
): Promise<ProviderResult> {
  const model = DEFAULT_MODEL.replicate!;
  try {
    const res = await fetch(
      `https://api.replicate.com/v1/models/${model}/predictions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Prefer: 'wait',
        },
        cache: 'no-store',
        body: JSON.stringify({
          input: {
            prompt,
            num_outputs: 1,
            aspect_ratio: '1:1',
            output_format: 'png',
          },
        }),
      },
    );

    const data = (await res.json()) as {
      id?: string;
      status?: string;
      output?: string | string[];
      error?: string;
      detail?: string;
    };
    const jobId = data.id ?? null;

    if (!res.ok) {
      return {
        ok: false,
        error: data.detail || data.error || `HTTP ${res.status}`,
        jobId,
        model,
      };
    }
    if (data.status === 'failed' || data.error) {
      return { ok: false, error: data.error || 'La generación falló.', jobId, model };
    }

    const imageUrl = Array.isArray(data.output) ? data.output[0] : data.output;
    if (!imageUrl) {
      return { ok: false, error: 'El proveedor no devolvió imagen.', jobId, model };
    }
    return { ok: true, imageUrl, jobId, model };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Error al contactar al proveedor.',
      jobId: null,
      model,
    };
  }
}

async function callProvider(
  provider: ApiKeyProvider,
  apiKey: string,
  prompt: string,
): Promise<ProviderResult> {
  switch (provider) {
    case 'replicate':
      return generateWithReplicate(apiKey, prompt);
    default:
      return {
        ok: false,
        error: 'La generación aún no está disponible para este proveedor.',
        jobId: null,
        model: '',
      };
  }
}

export type GenerationOutcome = {
  status: GenerationStatus;
  error?: string;
};

/**
 * Orquesta una generacion completa y la persiste en el historial.
 */
export async function runGeneration(params: {
  provider: ApiKeyProvider;
  prompt: string;
  avatarId?: string | null;
}): Promise<GenerationOutcome> {
  const { provider, prompt } = params;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: 'failed', error: 'No autenticado.' };

  if (!GENERATION_READY[provider]) {
    return {
      status: 'failed',
      error: 'La generación aún no está disponible para este proveedor.',
    };
  }

  const apiKey = await getDecryptedApiKey(provider);
  if (!apiKey) {
    return {
      status: 'failed',
      error: `No tienes una API key de ${provider} conectada.`,
    };
  }

  const avatarId = params.avatarId || null;

  // Registro inicial en estado "processing".
  const { data: inserted, error: insertError } = await supabase
    .from('generations')
    .insert({
      user_id: user.id,
      avatar_id: avatarId,
      provider,
      prompt,
      status: 'processing',
      model: DEFAULT_MODEL[provider] ?? null,
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    return { status: 'failed', error: insertError?.message ?? 'No se pudo registrar.' };
  }

  const result = await callProvider(provider, apiKey, prompt);

  if (!result.ok) {
    await supabase
      .from('generations')
      .update({ status: 'failed', error: result.error, provider_job_id: result.jobId })
      .eq('id', inserted.id);
    return { status: 'failed', error: result.error };
  }

  // Descargar la imagen y guardarla en el bucket privado (persistencia).
  try {
    const imgRes = await fetch(result.imageUrl, { cache: 'no-store' });
    if (!imgRes.ok) throw new Error(`No se pudo descargar el resultado (HTTP ${imgRes.status}).`);
    const bytes = new Uint8Array(await imgRes.arrayBuffer());
    const path = `${user.id}/${crypto.randomUUID()}.png`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: 'image/png', upsert: false });
    if (uploadError) throw new Error(uploadError.message);

    await supabase
      .from('generations')
      .update({
        status: 'succeeded',
        output_path: path,
        provider_job_id: result.jobId,
      })
      .eq('id', inserted.id);

    return { status: 'succeeded' };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Error al guardar el resultado.';
    await supabase
      .from('generations')
      .update({ status: 'failed', error, provider_job_id: result.jobId })
      .eq('id', inserted.id);
    return { status: 'failed', error };
  }
}

export type GenerationView = {
  id: string;
  prompt: string;
  provider: ApiKeyProvider;
  status: GenerationStatus;
  error: string | null;
  created_at: string;
  imageUrl: string | null;
};

/** Lista el historial de generaciones del usuario con URLs firmadas. */
export async function listGenerations(limit = 24): Promise<GenerationView[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('generations')
    .select('id, prompt, provider, status, output_path, error, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return Promise.all(
    data.map(async (row) => {
      let imageUrl: string | null = null;
      if (row.output_path) {
        const { data: signed } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(row.output_path, SIGNED_URL_TTL);
        imageUrl = signed?.signedUrl ?? null;
      }
      return {
        id: row.id,
        prompt: row.prompt,
        provider: row.provider,
        status: row.status,
        error: row.error,
        created_at: row.created_at,
        imageUrl,
      };
    }),
  );
}
