import { NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';

export const runtime = 'nodejs';

/**
 * Subida directa de videos (Motion): el celular sube el archivo DIRECTO a
 * Vercel Blob. Esta ruta solo entrega el permiso (token). Así se pueden subir
 * videos pesados (hasta 100 MB), que no entran por una ruta normal (límite de
 * ~4,5 MB por pedido en Vercel). Está protegida por la contraseña de la app
 * (middleware).
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as HandleUploadBody | null;
  if (!body) return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 });
  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith('motion/')) throw new Error('Carpeta no permitida.');
        return {
          // Videos (Motion) y audios (voz para "Mila hablando").
          allowedContentTypes: ['video/mp4', 'video/quicktime', 'video/webm', 'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/ogg', 'audio/webm'],
          maximumSizeInBytes: 100 * 1024 * 1024,
          addRandomSuffix: true,
        };
      },
    });
    return NextResponse.json(json);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'No se pudo subir el video.' }, { status: 400 });
  }
}
