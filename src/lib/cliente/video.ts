import { upload } from '@vercel/blob/client';

/** Del lado del celu: pide al servidor el mismo video pero sin sonido. */
export async function quitarSonido(url: string): Promise<{ url: string; teniaAudio: boolean; mb: number }> {
  const res = await fetch('/api/sin-audio', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d.url) throw new Error(d.error ?? 'No se pudo quitar el sonido.');
  return { url: d.url as string, teniaAudio: !!d.teniaAudio, mb: Number(d.mb) || 0 };
}

/** Formato soportado más parecido a un ancho × alto. */
export function aspectoMasCercano(w: number, h: number): string {
  const r = w / Math.max(1, h);
  const ops: [string, number][] = [['9:16', 9 / 16], ['3:4', 3 / 4], ['1:1', 1], ['4:3', 4 / 3], ['16:9', 16 / 9]];
  return ops.reduce((a, b) => (Math.abs(b[1] - r) < Math.abs(a[1] - r) ? b : a))[0];
}

/** Duración de un video/audio del celu (sin subirlo). */
export function duracionArchivo(file: File): Promise<number> {
  return new Promise((resolve) => {
    const u = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => { URL.revokeObjectURL(u); resolve(Number.isFinite(v.duration) ? v.duration : 0); };
    v.onerror = () => { URL.revokeObjectURL(u); resolve(0); };
    v.src = u;
  });
}

/** Saca un cuadro (JPG) de un <video> ya cargado, en el momento en que está. */
export function cuadroDeVideo(v: HTMLVideoElement): Promise<{ blob: Blob; w: number; h: number } | null> {
  return new Promise((resolve) => {
    try {
      const w = v.videoWidth, h = v.videoHeight;
      if (!w || !h) { resolve(null); return; }
      const k = Math.min(1, 1440 / Math.max(w, h));
      const c = document.createElement('canvas');
      c.width = Math.round(w * k); c.height = Math.round(h * k);
      c.getContext('2d')?.drawImage(v, 0, 0, c.width, c.height);
      c.toBlob((b) => resolve(b ? { blob: b, w, h } : null), 'image/jpeg', 0.92);
    } catch { resolve(null); }
  });
}

/** Toma un cuadro del principio de un video del celu (sin subirlo). */
export function cuadroDeArchivo(file: File, t = 0.3): Promise<{ blob: Blob; w: number; h: number } | null> {
  return new Promise((resolve) => {
    const u = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto';
    v.setAttribute('playsinline', ''); v.setAttribute('muted', '');
    let listo = false;
    const fin = (r: { blob: Blob; w: number; h: number } | null) => { if (listo) return; listo = true; clearTimeout(timer); URL.revokeObjectURL(u); resolve(r); };
    const timer = setTimeout(() => fin(null), 15000);
    v.onloadedmetadata = () => { v.currentTime = Math.min(t, (v.duration || 1) / 4); };
    v.onseeked = () => { cuadroDeVideo(v).then(fin); };
    v.onerror = () => fin(null);
    v.src = u; v.load();
  });
}

/** Sube una imagen (se achica a 2048 en el servidor) y devuelve su URL. */
export async function subirImagen(file: File, folder = 'refs'): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  form.append('folder', folder);
  const res = await fetch('/api/upload', { method: 'POST', body: form });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d.url) throw new Error(d.error ?? 'No se pudo subir la imagen.');
  return d.url as string;
}

/** Sube un video/audio DIRECTO al almacenamiento (carpeta motion/, se borra a los 3 días). */
export async function subirAMotion(file: File, nombre: string, onProgreso?: (pct: number) => void): Promise<string> {
  const ext = (file.name.split('.').pop() || 'mp4').toLowerCase();
  const tipo = file.type || (ext === 'mov' ? 'video/quicktime' : ext === 'webm' ? 'video/webm' : 'video/mp4');
  let fin = false;
  const blob = await upload(`motion/${nombre}.${ext}`, file, {
    access: 'public', handleUploadUrl: '/api/upload-video', contentType: tipo, multipart: file.size > 8 * 1024 * 1024,
    onUploadProgress: (p) => { if (!fin && onProgreso) onProgreso(Math.min(99, Math.max(1, Math.round(p.percentage)))); },
  });
  fin = true;
  return blob.url;
}

/** Espera a que termine una tarea de la IA (foto o video). */
export async function esperarTarea(taskId: string, sigue: () => boolean = () => true): Promise<{ url: string; credits?: number }> {
  for (let i = 0; i < 160; i++) {
    await new Promise((r) => setTimeout(r, i < 20 ? 3000 : 7000));
    if (!sigue()) throw new Error('cancelado');
    const d = await fetch(`/api/status?taskId=${encodeURIComponent(taskId)}`).then((r) => r.json()).catch(() => ({}));
    if (d.state === 'success' && d.url) return { url: d.url as string, credits: typeof d.credits === 'number' ? d.credits : undefined };
    if (d.state === 'fail') throw new Error(d.error || 'La IA no pudo crearlo. Probá de nuevo.');
  }
  throw new Error('Tardó demasiado. Probá de nuevo.');
}
