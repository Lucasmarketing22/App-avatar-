import Link from 'next/link';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { signOut } from '@/app/auth/actions';

export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Cuenta rapida de recursos del usuario para el panel.
  const [{ count: avatarsCount }, { count: presetsCount }, { count: keysCount }] =
    await Promise.all([
      supabase.from('avatars').select('*', { count: 'exact', head: true }),
      supabase.from('saved_presets').select('*', { count: 'exact', head: true }),
      supabase.from('user_api_keys').select('*', { count: 'exact', head: true }),
    ]);

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <header className="mb-10 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Panel</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">{user.email}</p>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            Cerrar sesión
          </button>
        </form>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <Stat label="Avatares" value={avatarsCount ?? 0} />
        <Stat label="Presets guardados" value={presetsCount ?? 0} />
        <Stat label="API keys conectadas" value={keysCount ?? 0} />
      </section>

      <section className="mt-8 grid gap-4 sm:grid-cols-2">
        <Link
          href="/dashboard/api-keys"
          className="rounded-xl border border-slate-200 bg-white p-5 transition hover:border-brand-500 dark:border-slate-800 dark:bg-slate-900"
        >
          <p className="font-semibold">Conectar API keys (BYOK) →</p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Añade tu key de fal, Higgsfield o Replicate para poder generar.
          </p>
        </Link>
      </section>

      <p className="mt-8 rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400">
        Siguientes módulos: Prompt Builder (sobre <code>prompt_blocks</code>) y
        gestión de avatares con Supabase Storage.
      </p>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-3xl font-bold">{value}</p>
      <p className="text-sm text-slate-600 dark:text-slate-400">{label}</p>
    </div>
  );
}
