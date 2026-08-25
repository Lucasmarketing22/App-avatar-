import Link from 'next/link';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { PromptBuilder } from '@/components/PromptBuilder';

export default async function PromptBuilderPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // RLS deja ver el catálogo global (user_id null) y los bloques propios.
  const [{ data: blocks }, { data: presets }] = await Promise.all([
    supabase.from('prompt_blocks').select('*').order('label'),
    supabase
      .from('saved_presets')
      .select('*')
      .order('created_at', { ascending: false }),
  ]);

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header className="mb-8">
        <Link
          href="/dashboard"
          className="text-sm text-slate-500 hover:underline dark:text-slate-400"
        >
          ← Volver al panel
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Prompt Builder</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Selecciona bloques por categoría para componer tu prompt maestro y
          guárdalo como preset.
        </p>
      </header>

      <PromptBuilder blocks={blocks ?? []} presets={presets ?? []} />
    </main>
  );
}
