import 'server-only';

import { idCuentaValido, picarClave } from '@/lib/auth';
import { listarTodo, readJsonEn, writeJsonEn } from '@/lib/storage';

/**
 * Cuentas de las personas que usan la app (las crea el administrador).
 * Una ficha por cuenta en cuentas/<id>.json. La contraseña nunca se guarda:
 * solo su versión "picada" (PBKDF2 con sal).
 */
export type Cuenta = {
  id: string;
  nombre: string;
  sal: string;
  hash: string;
  /** Sube al bloquear o cambiar la contraseña: las sesiones viejas dejan de servir. */
  version: number;
  bloqueada: boolean;
  creada: number;
};

const ruta = (id: string) => `cuentas/${id}.json`;

export async function leerCuenta(id: string): Promise<Cuenta | null> {
  if (!idCuentaValido(id)) return null;
  const c = await readJsonEn<Cuenta | null>(ruta(id), null);
  return c && c.id === id ? c : null;
}

export async function guardarCuenta(c: Cuenta): Promise<{ ok: boolean; error?: string }> {
  return writeJsonEn(ruta(c.id), c);
}

export async function listarCuentas(): Promise<Cuenta[]> {
  const blobs = await listarTodo('cuentas/');
  const ids = blobs.map((b) => b.pathname.replace(/^cuentas\//, '').replace(/\.json$/, '')).filter(idCuentaValido);
  const cuentas = await Promise.all(ids.map(leerCuenta));
  return cuentas.filter((c): c is Cuenta => !!c).sort((a, b) => a.creada - b.creada);
}

/** Usuario y contraseña correctos → la cuenta (si no está bloqueada). */
export async function verificarClave(id: string, clave: string): Promise<Cuenta | null> {
  const c = await leerCuenta(id);
  if (!c || c.bloqueada) return null;
  const { hash } = await picarClave(clave, c.sal);
  return hash === c.hash ? c : null;
}

/** Normaliza lo que escribe el administrador como usuario: "Paola Gómez" → "paola.gomez". */
export function normalizarUsuario(texto: string): string {
  return texto
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim()
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, 40);
}
