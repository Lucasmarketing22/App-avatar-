import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * Semáforo de configuración (diagnóstico). NO expone ninguna clave: solo dice
 * si cada variable está presente (true/false). Accesible sin contraseña para
 * poder verificar el despliegue.
 */
export async function GET() {
  return NextResponse.json({
    blob: !!process.env.BLOB_READ_WRITE_TOKEN,
    kie: !!process.env.KIE_API_KEY,
    password: !!process.env.APP_PASSWORD,
  });
}
