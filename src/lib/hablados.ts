import 'server-only';

import { readJson, writeJson } from '@/lib/storage';

/**
 * Configuración de "Hablados": idioma predeterminado y, por modelo, su muestra
 * de voz (para Kling 3.0) y las voces ya registradas en Gemini Omni.
 */
export type ConfigHablados = {
  idioma?: string;
  modelos?: Record<string, { voz?: { url: string; dur: number }; omni?: Record<string, string> }>;
};

export const leerConfig = () => readJson<ConfigHablados>('hablados', {});
export const guardarConfig = (c: ConfigHablados) => writeJson('hablados', c);

/** ID de modelo válido (los genera la app: letras, números y guiones). */
export function idModeloValido(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,60}$/.test(id);
}
