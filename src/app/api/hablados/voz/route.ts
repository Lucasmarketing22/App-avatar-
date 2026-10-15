import { promises as fs } from 'node:fs';
import path from 'node:path';

import { NextResponse } from 'next/server';

import { conCarpetaTemporal, correrFfmpeg, duracionDeLog, urlDeMotion } from '@/lib/ffmpeg';
import { guardarConfig, idModeloValido, leerConfig } from '@/lib/hablados';
import { removeObject, uploadPublic } from '@/lib/storage';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MIN = 5;
const MAX = 30;

/**
 * Muestra de voz de la modelo (para que Kling 3.0 hable con SU voz): saca el
 * audio de un video o audio subido, lo limpia (sin zumbido grave, menos ruido,
 * volumen parejo), lo deja entre 5 y 30 s y lo guarda para siempre en
 * hablados/ (no se borra a los 2 días como los videos).
 */
export async function POST(request: Request) {
  const b = (await request.json().catch(() => null)) as { url?: string; modeloId?: string } | null;
  const u = urlDeMotion(b?.url);
  if (!u) return NextResponse.json({ error: 'Archivo inválido.' }, { status: 400 });
  if (!idModeloValido(b?.modeloId)) return NextResponse.json({ error: 'Falta elegir la modelo.' }, { status: 400 });
  const modeloId = b!.modeloId as string;
  const url = u.toString();
  try {
    return await conCarpetaTemporal(async (dir) => {
      const ext = (u.pathname.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4';
      const entrada = path.join(dir, `in.${ext}`);
      const salida = path.join(dir, 'voz.mp3');
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) return NextResponse.json({ error: 'No se pudo leer el archivo.' }, { status: 502 });
      await fs.writeFile(entrada, new Uint8Array(await r.arrayBuffer()));
      await removeObject(url).catch(() => undefined);

      const info = await correrFfmpeg(['-hide_banner', '-i', entrada]);
      if (!/Stream #\d+:\d+(\[[^\]]*\])?(\([^)]*\))?: Audio/.test(info.log)) {
        return NextResponse.json({ error: 'Ese archivo no tiene sonido: subí un video o audio donde se la escuche hablar.' }, { status: 400 });
      }
      const durTotal = duracionDeLog(info.log);
      if (durTotal && durTotal < MIN) {
        return NextResponse.json({ error: `La muestra dura ${Math.round(durTotal)} s y hacen falta al menos ${MIN}. Subí un video donde hable más tiempo.` }, { status: 400 });
      }
      const dur = durTotal ? Math.min(MAX, durTotal) : MAX;
      const base = ['-hide_banner', '-y', '-i', entrada, '-vn', '-t', String(dur)];
      const fin = ['-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '192k', salida];
      let { code } = await correrFfmpeg([
        ...base,
        '-af', `highpass=f=80,afftdn=nr=10:nf=-50,loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=in:d=0.05,afade=t=out:st=${Math.max(0, dur - 0.15).toFixed(2)}:d=0.15`,
        ...fin,
      ]);
      // Si algún filtro de limpieza no está disponible, se guarda la voz sin limpiar (mejor que nada).
      if (code !== 0) ({ code } = await correrFfmpeg([...base, ...fin]));
      if (code !== 0) return NextResponse.json({ error: 'No se pudo sacar la voz de este archivo.' }, { status: 500 });

      const bytes = new Uint8Array(await fs.readFile(salida));
      const up = await uploadPublic(`hablados/voz-${modeloId}-${Date.now()}.mp3`, bytes, 'audio/mpeg');
      if (!up.url) return NextResponse.json({ error: up.error ?? 'No se pudo guardar la voz.' }, { status: 500 });

      const c = await leerConfig();
      const previa = c.modelos?.[modeloId]?.voz?.url;
      const modelos = { ...(c.modelos ?? {}) };
      modelos[modeloId] = { ...(modelos[modeloId] ?? {}), voz: { url: up.url, dur: Math.round(dur * 10) / 10 } };
      const g = await guardarConfig({ ...c, modelos });
      if (!g.ok) return NextResponse.json({ error: g.error ?? 'No se pudo guardar la voz.' }, { status: 500 });
      if (previa && previa !== up.url) await removeObject(previa).catch(() => undefined);
      return NextResponse.json({ url: up.url, dur: Math.round(dur * 10) / 10 });
    });
  } catch {
    return NextResponse.json({ error: 'No se pudo procesar la voz. Probá de nuevo.' }, { status: 500 });
  }
}

/** Borra la muestra de voz de una modelo. */
export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get('modeloId');
  if (!idModeloValido(id)) return NextResponse.json({ error: 'Modelo inválida.' }, { status: 400 });
  const c = await leerConfig();
  const previa = c.modelos?.[id]?.voz?.url;
  const modelos = { ...(c.modelos ?? {}) };
  if (modelos[id]) modelos[id] = { ...modelos[id], voz: undefined };
  await guardarConfig({ ...c, modelos });
  if (previa) await removeObject(previa).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
