'use client';

import Image from 'next/image';
import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';

import { generate, type GenerateState } from '@/app/dashboard/generate/actions';
import type { GenerationView } from '@/lib/generation';
import type { ApiKeyProvider } from '@/lib/database.types';

export type ProviderOption = {
  id: ApiKeyProvider;
  label: string;
  connected: boolean;
  ready: boolean;
};

type AvatarOption = { id: string; name: string };
type PresetOption = { id: string; name: string; final_prompt_text: string | null };

type Props = {
  providers: ProviderOption[];
  avatars: AvatarOption[];
  presets: PresetOption[];
  generations: GenerationView[];
};

export function GenerateStudio({ providers, avatars, presets, generations }: Props) {
  const usable = providers.filter((p) => p.connected && p.ready);
  const [prompt, setPrompt] = useState('');

  return (
    <div className="grid gap-8 lg:grid-cols-[380px_1fr]">
      <GenerateForm
        providers={providers}
        usable={usable}
        avatars={avatars}
        presets={presets}
        prompt={prompt}
        setPrompt={setPrompt}
      />
      <History generations={generations} />
    </div>
  );
}

function GenerateButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="w-full rounded-lg bg-brand-600 px-4 py-2.5 font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
    >
      {pending ? 'Generando… (puede tardar hasta 1 min)' : 'Generar imagen'}
    </button>
  );
}

function GenerateForm({
  providers,
  usable,
  avatars,
  presets,
  prompt,
  setPrompt,
}: {
  providers: ProviderOption[];
  usable: ProviderOption[];
  avatars: AvatarOption[];
  presets: PresetOption[];
  prompt: string;
  setPrompt: (v: string) => void;
}) {
  const [state, formAction] = useFormState<GenerateState, FormData>(generate, {});
  const noProvider = usable.length === 0;

  return (
    <aside className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <h3 className="font-semibold">Nueva generación</h3>

      {noProvider ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
          Conecta una API key de un proveedor con generación disponible (por
          ahora Replicate) en{' '}
          <a href="/dashboard/api-keys" className="font-medium underline">
            API keys
          </a>
          .
        </p>
      ) : null}

      <form action={formAction} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Proveedor</label>
          <select
            name="provider"
            defaultValue={usable[0]?.id}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          >
            {providers.map((p) => {
              const disabled = !p.connected || !p.ready;
              const suffix = !p.ready
                ? ' (próximamente)'
                : !p.connected
                  ? ' (sin key)'
                  : '';
              return (
                <option key={p.id} value={p.id} disabled={disabled}>
                  {p.label}
                  {suffix}
                </option>
              );
            })}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">
            Avatar{' '}
            <span className="text-slate-400">(opcional · mantiene su identidad)</span>
          </label>
          <select
            name="avatar_id"
            defaultValue=""
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          >
            <option value="">— Sin avatar —</option>
            {avatars.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        {presets.length > 0 ? (
          <div>
            <label className="mb-1 block text-sm font-medium">
              Cargar preset
            </label>
            <select
              defaultValue=""
              onChange={(e) => {
                const preset = presets.find((p) => p.id === e.target.value);
                if (preset?.final_prompt_text) setPrompt(preset.final_prompt_text);
              }}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            >
              <option value="">— Elegir preset —</option>
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div>
          <label className="mb-1 block text-sm font-medium">Prompt</label>
          <textarea
            name="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe la imagen (en inglés funciona mejor)…"
            className="h-32 w-full resize-none rounded-lg border border-slate-300 bg-white p-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-950"
          />
        </div>

        <GenerateButton disabled={noProvider} />

        {state.error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {state.error}
          </p>
        ) : null}
        {state.message ? (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
            {state.message}
          </p>
        ) : null}
      </form>
    </aside>
  );
}

function History({ generations }: { generations: GenerationView[] }) {
  return (
    <div>
      <h3 className="mb-3 font-semibold">Historial</h3>
      {generations.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          Todavía no generaste nada. Tu primera imagen aparecerá aquí.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {generations.map((g) => (
            <div
              key={g.id}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="relative aspect-square bg-slate-100 dark:bg-slate-950">
                {g.imageUrl ? (
                  <Image
                    src={g.imageUrl}
                    alt={g.prompt}
                    fill
                    sizes="(max-width: 640px) 50vw, 33vw"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center px-2 text-center text-xs text-slate-400">
                    {g.status === 'failed' ? g.error || 'Falló' : g.status}
                  </div>
                )}
              </div>
              <p className="truncate p-2 text-xs text-slate-500 dark:text-slate-400" title={g.prompt}>
                {g.prompt}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
