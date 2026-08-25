import type { ApiKeyProvider } from '@/lib/database.types';

/**
 * Catalogo de proveedores externos soportados para BYOK y logica de
 * validacion de sus API keys.
 */

export type ProviderMeta = {
  id: ApiKeyProvider;
  label: string;
  /** Pista de formato para el usuario. */
  hint: string;
  /** URL donde el usuario obtiene su API key. */
  keysUrl: string;
};

export const PROVIDERS: ProviderMeta[] = [
  {
    id: 'fal',
    label: 'fal.ai',
    hint: 'Formato "id:secret" o token que empieza por "fal_".',
    keysUrl: 'https://fal.ai/dashboard/keys',
  },
  {
    id: 'higgsfield',
    label: 'Higgsfield',
    hint: 'Token de API de tu panel de Higgsfield.',
    keysUrl: 'https://higgsfield.ai/',
  },
  {
    id: 'replicate',
    label: 'Replicate',
    hint: 'Token que empieza por "r8_".',
    keysUrl: 'https://replicate.com/account/api-tokens',
  },
];

export function getProviderMeta(id: ApiKeyProvider): ProviderMeta {
  const meta = PROVIDERS.find((p) => p.id === id);
  if (!meta) throw new Error(`Proveedor desconocido: ${id}`);
  return meta;
}

/**
 * Resultado de validar una API key:
 * - valid:      verificada contra el proveedor.
 * - invalid:    el proveedor la rechazo.
 * - unverified: guardada pero no se pudo verificar online (formato ok o sin
 *               red al proveedor); se validara en la primera generacion.
 */
export type ValidationStatus = 'valid' | 'invalid' | 'unverified';
export type ValidationResult = { status: ValidationStatus; detail: string };

/** Comprobacion de formato basica antes de intentar la verificacion online. */
function looksWellFormed(provider: ApiKeyProvider, key: string): boolean {
  const k = key.trim();
  if (k.length < 8) return false;
  switch (provider) {
    case 'replicate':
      return /^r8_[A-Za-z0-9]+$/.test(k) || k.length >= 20;
    case 'fal':
      return k.includes(':') || k.startsWith('fal_') || k.length >= 20;
    case 'higgsfield':
      return k.length >= 16;
    default:
      return true;
  }
}

/**
 * Valida una API key. Se ejecuta SOLO en el servidor (recibe la clave en claro).
 * Hace verificacion online cuando el proveedor expone un endpoint de auth
 * fiable; si no, cae a validacion por formato ("unverified").
 */
export async function validateProviderKey(
  provider: ApiKeyProvider,
  key: string,
): Promise<ValidationResult> {
  const trimmed = key.trim();
  if (!trimmed) return { status: 'invalid', detail: 'La clave está vacía.' };
  if (!looksWellFormed(provider, trimmed)) {
    return { status: 'invalid', detail: 'El formato de la clave no es válido.' };
  }

  try {
    switch (provider) {
      case 'replicate': {
        // /v1/account devuelve la cuenta autenticada: ideal para validar.
        const res = await fetch('https://api.replicate.com/v1/account', {
          headers: { Authorization: `Bearer ${trimmed}` },
          cache: 'no-store',
        });
        if (res.ok) return { status: 'valid', detail: 'Clave verificada.' };
        if (res.status === 401 || res.status === 403) {
          return { status: 'invalid', detail: 'Replicate rechazó la clave.' };
        }
        return {
          status: 'unverified',
          detail: `No se pudo verificar (HTTP ${res.status}).`,
        };
      }

      case 'fal': {
        // fal usa "Authorization: Key <key>". Consultamos un endpoint ligero;
        // interpretamos 401/403 como rechazo y el resto como no concluyente.
        const res = await fetch('https://rest.alpha.fal.ai/tokens/', {
          method: 'GET',
          headers: { Authorization: `Key ${trimmed}` },
          cache: 'no-store',
        });
        if (res.status === 401 || res.status === 403) {
          return { status: 'invalid', detail: 'fal rechazó la clave.' };
        }
        if (res.ok) return { status: 'valid', detail: 'Clave verificada.' };
        return {
          status: 'unverified',
          detail: 'Guardada. Se verificará en la primera generación.',
        };
      }

      case 'higgsfield':
      default: {
        // Sin endpoint publico de auth fiable: guardamos como no verificada.
        return {
          status: 'unverified',
          detail: 'Guardada. Se verificará en la primera generación.',
        };
      }
    }
  } catch {
    // Sin red al proveedor (o bloqueado por el entorno): no invalidamos.
    return {
      status: 'unverified',
      detail: 'Guardada. No se pudo contactar al proveedor para verificar.',
    };
  }
}
