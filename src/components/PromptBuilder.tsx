'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';

import {
  CATEGORY_LABELS,
  composePrompt,
  groupByCategory,
  type PromptBlock,
  type SavedPreset,
} from '@/lib/prompt-builder';
import {
  createCustomBlock,
  deleteCustomBlock,
  deletePreset,
  savePreset,
  type ActionState,
} from '@/app/dashboard/prompt-builder/actions';
import { CATEGORY_ORDER } from '@/lib/prompt-builder';

type Props = {
  blocks: PromptBlock[];
  presets: SavedPreset[];
};

export function PromptBuilder({ blocks, presets }: Props) {
  const [selected, setSelected] = useState<string[]>([]);

  // Si un bloque seleccionado deja de existir (p.ej. se borró), lo limpiamos.
  useEffect(() => {
    setSelected((prev) => prev.filter((id) => blocks.some((b) => b.id === id)));
  }, [blocks]);

  const grouped = useMemo(() => groupByCategory(blocks), [blocks]);
  const prompt = useMemo(() => composePrompt(blocks, selected), [blocks, selected]);

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function loadPreset(preset: SavedPreset) {
    // Solo cargamos los ids que siguen existiendo entre los bloques accesibles.
    setSelected(preset.block_ids.filter((id) => blocks.some((b) => b.id === id)));
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      {/* Columna izquierda: catálogo de bloques por categoría */}
      <div className="space-y-6">
        {grouped.map(({ category, blocks: catBlocks }) => (
          <section key={category}>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {CATEGORY_LABELS[category]}
            </h3>
            {catBlocks.length === 0 ? (
              <p className="text-sm text-slate-400">Sin bloques en esta categoría.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {catBlocks.map((block) => {
                  const isOn = selected.includes(block.id);
                  return (
                    <span key={block.id} className="group relative">
                      <button
                        type="button"
                        onClick={() => toggle(block.id)}
                        title={block.prompt_fragment}
                        className={
                          'rounded-full border px-3 py-1.5 text-sm transition ' +
                          (isOn
                            ? 'border-brand-600 bg-brand-600 text-white'
                            : 'border-slate-300 bg-white hover:border-brand-500 dark:border-slate-700 dark:bg-slate-900')
                        }
                      >
                        {block.label}
                        {block.is_custom ? (
                          <span className="ml-1 opacity-70">·</span>
                        ) : null}
                      </button>
                      {block.is_custom ? (
                        <form action={deleteCustomBlock} className="inline">
                          <input type="hidden" name="id" value={block.id} />
                          <button
                            type="submit"
                            title="Eliminar bloque personalizado"
                            className="ml-1 text-xs text-slate-400 hover:text-red-500"
                          >
                            ✕
                          </button>
                        </form>
                      ) : null}
                    </span>
                  );
                })}
              </div>
            )}
          </section>
        ))}

        <CustomBlockForm />
      </div>

      {/* Columna derecha: prompt en vivo + presets */}
      <aside className="space-y-6">
        <PromptPreview prompt={prompt} count={selected.length} />
        <SavePresetForm selected={selected} disabled={selected.length === 0} />
        <PresetList presets={presets} onLoad={loadPreset} />
      </aside>
    </div>
  );
}

function PromptPreview({ prompt, count }: { prompt: string; count: number }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="sticky top-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold">Prompt maestro</h3>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {count} bloque{count === 1 ? '' : 's'}
        </span>
      </div>
      <textarea
        readOnly
        value={prompt}
        placeholder="Selecciona bloques para componer el prompt…"
        className="h-36 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-950"
      />
      <button
        type="button"
        onClick={copy}
        disabled={!prompt}
        className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
      >
        {copied ? '¡Copiado!' : 'Copiar prompt'}
      </button>
    </div>
  );
}

function SaveButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
    >
      {pending ? 'Guardando…' : 'Guardar preset'}
    </button>
  );
}

function SavePresetForm({
  selected,
  disabled,
}: {
  selected: string[];
  disabled: boolean;
}) {
  const [state, formAction] = useFormState<ActionState, FormData>(savePreset, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.message) formRef.current?.reset();
  }, [state.message]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h3 className="mb-2 font-semibold">Guardar como preset</h3>
      <form ref={formRef} action={formAction} className="flex flex-col gap-2">
        {selected.map((id) => (
          <input key={id} type="hidden" name="block_ids" value={id} />
        ))}
        <input
          name="name"
          placeholder="Nombre del preset"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-950"
        />
        <SaveButton disabled={disabled} />
      </form>
      {state.error ? (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{state.error}</p>
      ) : null}
      {state.message ? (
        <p className="mt-2 text-sm text-emerald-600 dark:text-emerald-400">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}

function PresetList({
  presets,
  onLoad,
}: {
  presets: SavedPreset[];
  onLoad: (p: SavedPreset) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h3 className="mb-2 font-semibold">Mis presets</h3>
      {presets.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Aún no guardaste presets.
        </p>
      ) : (
        <ul className="space-y-2">
          {presets.map((preset) => (
            <li
              key={preset.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800"
            >
              <button
                type="button"
                onClick={() => onLoad(preset)}
                className="flex-1 text-left"
              >
                <span className="block text-sm font-medium">{preset.name}</span>
                <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                  {preset.final_prompt_text || `${preset.block_ids.length} bloques`}
                </span>
              </button>
              <form action={deletePreset}>
                <input type="hidden" name="id" value={preset.id} />
                <button
                  type="submit"
                  title="Eliminar preset"
                  className="text-slate-400 hover:text-red-500"
                >
                  ✕
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CreateBlockButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
    >
      {pending ? 'Creando…' : 'Añadir bloque'}
    </button>
  );
}

function CustomBlockForm() {
  const [state, formAction] = useFormState<ActionState, FormData>(
    createCustomBlock,
    {},
  );
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.message) formRef.current?.reset();
  }, [state.message]);

  return (
    <section className="rounded-xl border border-dashed border-slate-300 p-4 dark:border-slate-700">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-sm font-medium text-brand-600 hover:underline"
      >
        {open ? '− Cerrar' : '+ Crear bloque personalizado'}
      </button>

      {open ? (
        <form ref={formRef} action={formAction} className="mt-3 grid gap-2 sm:grid-cols-2">
          <select
            name="category"
            defaultValue="accion"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          >
            {CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
          <input
            name="label"
            placeholder="Nombre visible"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          />
          <input
            name="prompt_fragment"
            placeholder="Fragmento en inglés que se inyecta al prompt"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm sm:col-span-2 dark:border-slate-700 dark:bg-slate-950"
          />
          <div className="sm:col-span-2">
            <CreateBlockButton />
          </div>
          {state.error ? (
            <p className="text-sm text-red-600 sm:col-span-2 dark:text-red-400">
              {state.error}
            </p>
          ) : null}
        </form>
      ) : null}
    </section>
  );
}
