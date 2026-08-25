import Link from 'next/link';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';

export default async function HomePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect('/dashboard');

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-8 px-6 text-center">
      <span className="rounded-full bg-brand-100 px-3 py-1 text-sm font-medium text-brand-700 dark:bg-brand-700/20 dark:text-brand-100">
        BYOK · Bring Your Own Key
      </span>
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
        Crea contenido UGC con IA usando tus propios avatares
      </h1>
      <p className="max-w-xl text-lg text-slate-600 dark:text-slate-400">
        Conecta tu API key de fal, Higgsfield o Replicate, arma tus prompts con
        el Prompt Builder y genera imágenes consistentes de tus avatares.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/signup"
          className="rounded-lg bg-brand-600 px-5 py-2.5 font-medium text-white transition hover:bg-brand-700"
        >
          Crear cuenta
        </Link>
        <Link
          href="/login"
          className="rounded-lg border border-slate-300 px-5 py-2.5 font-medium transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          Iniciar sesión
        </Link>
      </div>
    </main>
  );
}
