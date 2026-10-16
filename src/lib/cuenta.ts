import 'server-only';

import { AsyncLocalStorage } from 'node:async_hooks';

import { headers } from 'next/headers';

import { CUENTA_ADMIN, HEADER_CUENTA, HEADER_VERSION, idCuentaValido } from '@/lib/auth';

/**
 * ¿De quién es este pedido? Lo anota el middleware en un encabezado interno.
 * Cuando el servidor trabaja "por su cuenta" (el aviso de Kie al terminar un
 * video), se indica a mano con conCuenta().
 */
const contexto = new AsyncLocalStorage<string>();

export function conCuenta<T>(cuenta: string, fn: () => Promise<T>): Promise<T> {
  return contexto.run(cuenta, fn);
}

/** 'admin', el id de una persona, o '' si el pedido no tiene cuenta (rutas públicas). */
export function cuentaActual(): string {
  const fija = contexto.getStore();
  if (fija !== undefined) return fija;
  try {
    const c = headers().get(HEADER_CUENTA) ?? '';
    return c === CUENTA_ADMIN || idCuentaValido(c) ? c : '';
  } catch {
    return '';
  }
}

/** Versión de la sesión (cambia al bloquear o cambiar la contraseña). */
export function versionSesion(): number {
  try { return Number(headers().get(HEADER_VERSION) ?? '0') || 0; } catch { return 0; }
}

/** Funciones que usan servicios pagos fuera de Kie (voz propia con Fish Audio): solo el administrador. */
export const SOLO_ADMIN = 'Esta función todavía no está disponible en tu cuenta.';

export function esAdmin(cuenta = cuentaActual()): boolean {
  return cuenta === CUENTA_ADMIN;
}

/**
 * Carpeta de cada cuenta en el almacenamiento. El administrador usa la raíz
 * (así todo lo que ya existía sigue siendo suyo); cada persona, u/<id>/.
 */
export function carpetaDe(cuenta: string): string {
  if (cuenta === CUENTA_ADMIN) return '';
  if (idCuentaValido(cuenta)) return `u/${cuenta}/`;
  throw new Error('Pedido sin cuenta.');
}
