'use client';

import { useFormState, useFormStatus } from 'react-dom';

import { saveApiKey, removeApiKey, type SaveKeyState } from '@/app/dashboard/api-keys/actions';
import type { ProviderMeta } from '@/lib/providers';
import type { StoredApiKey } from '@/lib/api-keys';

type Props = {
  providers: ProviderMeta[];
  stored: StoredApiKey[];
};

export function ApiKeysManager({ providers, stored }: Props) {
  const byProvider = new Map(stored.map((k) => [k.provider, k]));
  return (
    <div className="space-y-4">
      {providers.map((meta) => (
        <ProviderCard
          key={meta.id}
          meta={meta}
          existing={byProvider.get(meta.id)}
        />
      ))}
    </div>
  );
}

function StatusBadge({ existing }: { existing?: StoredApiKey }) {
  if (!existing) {
    return (
      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
        Sin conectar
      </span>
    );
  }
  if (existing.is_valid) {
    return (
      <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
        Verificada
      </span>
    );
  }
  return (
    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
      Guardada · sin verificar
    </span>
  );
}

function SaveButton({ hasKey }: { hasKey: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
    >
      {pending ? 'Guardando…' : hasKey ? 'Actualizar' : 'Conectar'}
    </button>
  );
}

function DeleteButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-red-950/30"
    >
      {pending ? 'Eliminando…' : 'Eliminar'}
    </button>
  );
}

function ProviderCard({
  meta,
  existing,
}: {
  meta: ProviderMeta;
  existing?: StoredApiKey;
}) {
  const [state, formAction] = useFormState<SaveKeyState, FormData>(saveApiKey, {});

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">{meta.label}</h3>
            <StatusBadge existing={existing} />
          </div>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {meta.hint}{' '}
            <a
              href={meta.keysUrl}
              target="_blank"
              rel="noreferrer"
              className="text-brand-600 hover:underline"
            >
              Obtener key
            </a>
          </p>
        </div>
        {existing ? (
          <code className="shrink-0 rounded bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {existing.masked}
          </code>
        ) : null}
      </div>

      <form action={formAction} className="flex flex-col gap-2 sm:flex-row">
        <input type="hidden" name="provider" value={meta.id} />
        <input
          type="password"
          name="api_key"
          autoComplete="off"
          placeholder={existing ? 'Introduce una nueva key para reemplazar' : 'Pega tu API key'}
          className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-950"
        />
        <SaveButton hasKey={Boolean(existing)} />
      </form>

      {state.error ? (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{state.error}</p>
      ) : null}
      {state.message ? (
        <p className="mt-2 text-sm text-emerald-600 dark:text-emerald-400">
          {state.message}
        </p>
      ) : null}

      {existing ? (
        <form action={removeApiKey} className="mt-3">
          <input type="hidden" name="provider" value={meta.id} />
          <DeleteButton />
        </form>
      ) : null}
    </div>
  );
}
