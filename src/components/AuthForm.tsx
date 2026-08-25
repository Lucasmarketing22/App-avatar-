'use client';

import Link from 'next/link';
import { useFormState, useFormStatus } from 'react-dom';

import type { AuthState } from '@/app/auth/actions';

type Mode = 'login' | 'signup';

type Props = {
  mode: Mode;
  action: (state: AuthState, formData: FormData) => Promise<AuthState>;
  redirectTo?: string;
};

function SubmitButton({ mode }: { mode: Mode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-brand-600 px-4 py-2.5 font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
    >
      {pending
        ? 'Procesando…'
        : mode === 'login'
          ? 'Iniciar sesión'
          : 'Crear cuenta'}
    </button>
  );
}

export function AuthForm({ mode, action, redirectTo }: Props) {
  const [state, formAction] = useFormState<AuthState, FormData>(action, {});

  return (
    <div className="w-full max-w-sm">
      <h1 className="mb-1 text-2xl font-bold">
        {mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
      </h1>
      <p className="mb-6 text-sm text-slate-600 dark:text-slate-400">
        {mode === 'login'
          ? 'Accede a tu panel de creación UGC.'
          : 'Empieza a generar contenido UGC con IA.'}
      </p>

      <form action={formAction} className="space-y-4">
        {redirectTo ? (
          <input type="hidden" name="redirectTo" value={redirectTo} />
        ) : null}

        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900"
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium">
            Contraseña
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
            minLength={mode === 'signup' ? 8 : undefined}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900"
          />
        </div>

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

        <SubmitButton mode={mode} />
      </form>

      <p className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
        {mode === 'login' ? (
          <>
            ¿No tienes cuenta?{' '}
            <Link href="/signup" className="font-medium text-brand-600 hover:underline">
              Regístrate
            </Link>
          </>
        ) : (
          <>
            ¿Ya tienes cuenta?{' '}
            <Link href="/login" className="font-medium text-brand-600 hover:underline">
              Inicia sesión
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
