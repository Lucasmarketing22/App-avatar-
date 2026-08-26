'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';

import {
  uploadAvatar,
  removeAvatar,
  type AvatarState,
} from '@/app/dashboard/avatars/actions';
import type { AvatarView } from '@/lib/avatars';

type Props = {
  avatars: AvatarView[];
};

export function AvatarsManager({ avatars }: Props) {
  return (
    <div className="space-y-8">
      <UploadForm />
      <Gallery avatars={avatars} />
    </div>
  );
}

function UploadButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
    >
      {pending ? 'Subiendo…' : 'Crear avatar'}
    </button>
  );
}

function UploadForm() {
  const [state, formAction] = useFormState<AvatarState, FormData>(uploadAvatar, {});
  const [preview, setPreview] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.message) {
      formRef.current?.reset();
      setPreview(null);
    }
  }, [state.message]);

  // Libera el object URL de la vista previa al desmontar/cambiar.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return file ? URL.createObjectURL(file) : null;
    });
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
    >
      <h3 className="mb-3 font-semibold">Nuevo avatar</h3>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-950">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Vista previa" className="h-full w-full object-cover" />
          ) : (
            <span className="px-2 text-center text-xs text-slate-400">
              Vista previa
            </span>
          )}
        </div>

        <div className="flex-1 space-y-3">
          <input
            name="name"
            placeholder="Nombre del avatar (p.ej. Sofía)"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-950"
          />
          <input
            name="file"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={onFileChange}
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100 dark:text-slate-300"
          />
          <p className="text-xs text-slate-500 dark:text-slate-400">
            PNG, JPG o WEBP · máx. 10 MB. Se guarda en un bucket privado.
          </p>
          <UploadButton />
          {state.error ? (
            <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
          ) : null}
          {state.message ? (
            <p className="text-sm text-emerald-600 dark:text-emerald-400">
              {state.message}
            </p>
          ) : null}
        </div>
      </div>
    </form>
  );
}

function Gallery({ avatars }: { avatars: AvatarView[] }) {
  if (avatars.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
        Aún no tienes avatares. Sube tu primera imagen de referencia.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {avatars.map((avatar) => (
        <div
          key={avatar.id}
          className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="relative aspect-square bg-slate-100 dark:bg-slate-950">
            {avatar.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatar.imageUrl}
                alt={avatar.name}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-slate-400">
                Sin imagen
              </div>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 p-3">
            <span className="truncate text-sm font-medium" title={avatar.name}>
              {avatar.name}
            </span>
            <form action={removeAvatar}>
              <input type="hidden" name="id" value={avatar.id} />
              <button
                type="submit"
                title="Eliminar avatar"
                className="shrink-0 text-slate-400 hover:text-red-500"
              >
                ✕
              </button>
            </form>
          </div>
        </div>
      ))}
    </div>
  );
}
