import Link from 'next/link';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { listApiKeys } from '@/lib/api-keys';
import { listGenerations, GENERATION_READY } from '@/lib/generation';
import { PROVIDERS } from '@/lib/providers';
import { GenerateStudio, type ProviderOption } from '@/components/GenerateStudio';

// La generación puede tardar; damos hasta 60s a la función serverless.
export const maxDuration = 60;

export default async function GeneratePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [keys, generations, { data: avatars }, { data: presets }] = await Promise.all([
    listApiKeys(),
    listGenerations(),
    supabase.from('avatars').select('id, name').order('created_at', { ascending: false }),
    supabase
      .from('saved_presets')
      .select('id, name, final_prompt_text')
      .order('created_at', { ascending: false }),
  ]);

  const connected = new Set(keys.map((k) => k.provider));
  const providers: ProviderOption[] = PROVIDERS.map((p) => ({
    id: p.id,
    label: p.label,
    connected: connected.has(p.id),
    ready: GENERATION_READY[p.id],
  }));

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header className="mb-8">
        <Link
          href="/dashboard"
          className="text-sm text-slate-500 hover:underline dark:text-slate-400"
        >
          ← Volver al panel
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Generar</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Elige un avatar (su imagen de referencia mantiene la identidad) y un
          prompt, o carga un preset, y genera con tu propia API key. Los
          resultados se guardan en tu historial privado.
        </p>
      </header>

      <GenerateStudio
        providers={providers}
        avatars={avatars ?? []}
        presets={presets ?? []}
        generations={generations}
      />
    </main>
  );
}
