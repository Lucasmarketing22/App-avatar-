import 'server-only';

import crypto from 'node:crypto';

/**
 * Cifrado autenticado AES-256-GCM para las API keys BYOK de los usuarios.
 *
 * La clave maestra vive en la variable de entorno ENCRYPTION_KEY (32 bytes
 * en hex = 64 caracteres). Genera una con:  openssl rand -hex 32
 *
 * Formato de salida (string) para guardar en la columna `api_key_encrypted`:
 *   base64(iv).base64(authTag).base64(ciphertext)
 *
 * Nunca se guarda la API key en claro ni se envia al cliente.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // recomendado para GCM
const KEY_LENGTH = 32; // AES-256

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('Falta la variable de entorno ENCRYPTION_KEY.');
  }
  const key = Buffer.from(raw, 'hex');
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      'ENCRYPTION_KEY debe ser de 32 bytes en hex (64 caracteres). Usa: openssl rand -hex 32',
    );
  }
  return key;
}

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted.toString('base64'),
  ].join('.');
}

export function decrypt(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split('.');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Formato de dato cifrado invalido.');
  }
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(ivB64, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

/**
 * Devuelve una vista enmascarada de una API key para mostrarla en UI,
 * p.ej. "fal_****abcd". Nunca reveles la clave completa al cliente.
 */
export function maskApiKey(plaintext: string): string {
  if (plaintext.length <= 8) return '****';
  return `${plaintext.slice(0, 4)}****${plaintext.slice(-4)}`;
}
