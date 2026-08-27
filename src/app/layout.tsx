import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'App-avatar · UGC con IA',
  description:
    'Plataforma SaaS de creación de contenido UGC con IA. Conecta tu propia API key (BYOK) y genera imágenes con tus avatares.',
  // La app ya está en español: evitamos la traducción automática del navegador,
  // que reescribe el DOM y hace fallar a React ("client-side exception").
  other: { google: 'notranslate' },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" translate="no" className="notranslate">
      <body>{children}</body>
    </html>
  );
}
