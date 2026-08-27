'use client';

import { useEffect } from 'react';

/**
 * Red de seguridad para el área del dashboard. Si un componente de cliente
 * lanza una excepción (p.ej. ChunkLoadError tras un nuevo despliegue), en vez
 * de una pantalla en blanco mostramos un mensaje con opción de recargar.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Un error de carga de "chunk" ocurre cuando el navegador tiene una versión
    // vieja en caché tras una actualización: recargar de cero lo resuelve.
    if (/ChunkLoadError|Loading chunk|dynamically imported module/i.test(error?.message ?? '')) {
      window.location.reload();
    }
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-bold">Algo salió mal al cargar esta página</h1>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Suele resolverse recargando. Si acabás de ver una actualización, esto
        limpia la versión vieja del navegador.
      </p>
      <div className="flex gap-3">
        <button
          onClick={() => window.location.reload()}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
        >
          Recargar
        </button>
        <button
          onClick={() => reset()}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          Reintentar
        </button>
      </div>
    </main>
  );
}
