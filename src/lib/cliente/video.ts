/** Del lado del celu: pide al servidor el mismo video pero sin sonido. */
export async function quitarSonido(url: string): Promise<{ url: string; teniaAudio: boolean; mb: number }> {
  const res = await fetch('/api/sin-audio', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d.url) throw new Error(d.error ?? 'No se pudo quitar el sonido.');
  return { url: d.url as string, teniaAudio: !!d.teniaAudio, mb: Number(d.mb) || 0 };
}
