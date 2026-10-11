import 'server-only';

import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import ffmpegPath from 'ffmpeg-static';

/** Corre ffmpeg y devuelve el código y lo que escribió (info de streams, duración). */
export function correrFfmpeg(args: string[]): Promise<{ code: number; log: string }> {
  return new Promise((resolve) => {
    if (!ffmpegPath) { resolve({ code: 1, log: 'sin ffmpeg' }); return; }
    const p = spawn(ffmpegPath as unknown as string, args);
    let log = '';
    p.stderr.on('data', (d) => { log += String(d); if (log.length > 20000) log = log.slice(-20000); });
    p.on('close', (code) => resolve({ code: code ?? 1, log }));
    p.on('error', (e) => resolve({ code: 1, log: String(e) }));
  });
}

/** Duración (segundos) leída del log de ffmpeg ("Duration: 00:00:09.00"). */
export function duracionDeLog(log: string): number {
  const m = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(log);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
}

/** Carpeta temporal que se borra sola al terminar. */
export async function conCarpetaTemporal<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ff-'));
  try { return await fn(dir); } finally { await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined); }
}

/** Solo archivos nuestros de la carpeta motion/ (videos/audios subidos para crear). */
export function urlDeMotion(url: unknown): URL | null {
  if (typeof url !== 'string') return null;
  try {
    const u = new URL(url);
    return u.hostname.endsWith('.public.blob.vercel-storage.com') && u.pathname.startsWith('/motion/') ? u : null;
  } catch { return null; }
}
