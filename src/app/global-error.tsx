'use client';

import { useEffect } from 'react';

/**
 * Último recurso: captura errores que ocurren incluso en el layout raíz.
 * Debe renderizar sus propios <html>/<body>.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (/ChunkLoadError|Loading chunk|dynamically imported module/i.test(error?.message ?? '')) {
      window.location.reload();
    }
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0f172a',
          color: '#e2e8f0',
          margin: 0,
        }}
      >
        <div style={{ textAlign: 'center', padding: 24, maxWidth: 420 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>Algo salió mal</h1>
          <p style={{ fontSize: 14, color: '#94a3b8' }}>
            Recargá la página para volver a intentar.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: 12,
              padding: '8px 16px',
              borderRadius: 8,
              border: 0,
              background: '#4f46e5',
              color: '#fff',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Recargar
          </button>
        </div>
      </body>
    </html>
  );
}
