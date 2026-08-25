import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'App-avatar · UGC con IA',
  description:
    'Plataforma SaaS de creación de contenido UGC con IA. Conecta tu propia API key (BYOK) y genera imágenes con tus avatares.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
