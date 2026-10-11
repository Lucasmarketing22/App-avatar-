/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // ffmpeg (para quitarle el sonido a los videos) es un programa aparte:
    // hay que incluirlo a mano en la función que lo usa.
    serverComponentsExternalPackages: ['ffmpeg-static'],
    outputFileTracingIncludes: {
      '/api/sin-audio': ['./node_modules/ffmpeg-static/ffmpeg'],
    },
  },
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
