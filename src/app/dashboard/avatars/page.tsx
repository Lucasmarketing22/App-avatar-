import Link from 'next/link';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { listAvatars } from '@/lib/avatars';
import { AvatarsManager } from '@/components/AvatarsManager';

export default async function AvatarsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const avatars = await listAvatars();

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <header className="mb-8">
        <Link
          href="/dashboard"
          className="text-sm text-slate-500 hover:underline dark:text-slate-400"
        >
          ← Volver al panel
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Avatares</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Sube imágenes de referencia de tus avatares. Se guardan en un bucket
          privado y solo tú puedes verlas.
        </p>
      </header>

      <AvatarsManager avatars={avatars} />
    </main>
  );
}
