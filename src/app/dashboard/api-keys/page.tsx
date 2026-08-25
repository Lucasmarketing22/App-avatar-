import Link from 'next/link';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { listApiKeys } from '@/lib/api-keys';
import { PROVIDERS } from '@/lib/providers';
import { ApiKeysManager } from '@/components/ApiKeysManager';

export default async function ApiKeysPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const stored = await listApiKeys();

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <header className="mb-8">
        <Link
          href="/dashboard"
          className="text-sm text-slate-500 hover:underline dark:text-slate-400"
        >
          ← Volver al panel
        </Link>
        <h1 className="mt-2 text-2xl font-bold">API keys (BYOK)</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Conecta tu propia API key de cada proveedor. Se guarda cifrada
          (AES-256-GCM) y nunca se muestra completa.
        </p>
      </header>

      <ApiKeysManager providers={PROVIDERS} stored={stored} />
    </main>
  );
}
