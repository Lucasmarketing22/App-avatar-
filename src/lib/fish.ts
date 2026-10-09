/** Fish Audio: clave (solo del lado del servidor) y base de la API. */
export const FISH_API = 'https://api.fish.audio';

export function fishKey(): string {
  // Acepta el nombre estándar y también "fishapi" (como lo cargó el usuario).
  return process.env.FISH_AUDIO_API_KEY || process.env.fishapi || process.env.FISHAPI || '';
}

/** Mensaje claro según el error de Fish Audio. */
export function errorFish(status: number, detalle = ''): string {
  if (status === 401) return 'La clave de Fish Audio no es válida.';
  if (status === 402 || status === 403) return 'Te quedaste sin crédito en Fish Audio (o el plan no lo permite).';
  if (status === 422) return 'Fish Audio rechazó el pedido (dato inválido). Revisá el texto o la voz elegida.';
  if (status === 503) return 'Fish Audio está saturado en este momento. Probá de nuevo en un rato.';
  return `Fish Audio devolvió un error (${status}). ${detalle.slice(0, 160)}`;
}

/** IDs de voz de Fish: letras, números, guiones (ej: 32 hex). */
export function idVozValido(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{6,80}$/.test(id);
}
