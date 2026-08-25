import { createBrowserClient } from '@supabase/ssr';

import type { Database } from '@/lib/database.types';

/**
 * Cliente de Supabase para componentes de cliente ("use client").
 * Usa la clave anon: todo el acceso queda protegido por las policies RLS.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
