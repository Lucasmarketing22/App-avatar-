/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // Permite que Next optimice (achique a miniaturas) las imagenes guardadas
    // en Supabase Storage y en Vercel Blob. Sin esto, el navegador del celular
    // descarga y decodifica las fotos en 4K completas y se queda sin memoria
    // (pantalla gris / se traba), sobre todo en iPhone / Safari privado.
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
      {
        protocol: 'https',
        hostname: '*.public.blob.vercel-storage.com',
      },
    ],
  },
};

export default nextConfig;
