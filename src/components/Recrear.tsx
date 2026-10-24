'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

import type { Estimado } from '@/components/ConfirmarVideo';
import { aspectoMasCercano, cuadroDeArchivo, duracionArchivo, esperarTarea, subirAMotion, subirImagen } from '@/lib/cliente/video';
import { componerRecrear } from '@/lib/estudio/prompt';

type Modelo = { id: string; nombre: string; refs: string[]; cuerpo?: string; entero?: string; medio?: string; promptFijo?: string };

const fmt = (n: number) => Math.round(n).toLocaleString('es-AR');
const usd = (n: number) => `US$ ${(n * 0.005).toFixed(2).replace('.', ',')}`;

/** Lo subido: el video viral (con su primer cuadro) o la foto viral. */
type Viral =
  | { tipo: 'video'; url: string; cuadro: string; dur: number; w: number; h: number }
  | { tipo: 'foto'; url: string; w: number; h: number };

/**
 * Recrear (como "Recreate" de Creame, pero simple): subís un video o una foto
 * viral, elegís tu modelo y tocás un botón.
 *  - Foto: Seedream recrea la misma foto con tu modelo.
 *  - Video: 1) Seedream pone a tu modelo en el primer cuadro del viral (mismo
 *    lugar, pose, ropa y luz); vos la aprobás; 2) Kling 3.0 Motion Control
 *    copia todos los movimientos del viral, con el sonido original.
 * Todo queda en la Galería aunque se cierre la app (lo guarda el servidor).
 */
export default function Recrear(p: {
  modelas: Modelo[];
  activoId: string;
  costo: (clave: string) => number | null;
  estimar: (clave: string, dur: number) => Estimado;
  claveFoto: string;
  onCreacion: (c: { url: string; prompt: string; refs: string[]; aspect: string; credits?: number }) => void;
  onVideo: (url: string) => void;
  onGuardar: (url: string, tipo: 'foto' | 'video') => void;
  onTrabajo: (msg: string) => void;
  onSaldo: () => void;
}) {
  const { modelas, activoId, costo, estimar, claveFoto, onCreacion, onVideo, onGuardar, onTrabajo, onSaldo } = p;
  const [viral, setViral] = useState<Viral | null>(null);
  const [modeloId, setModeloId] = useState(activoId);
  const [calidad, setCalidad] = useState<'720p' | '1080p'>('720p');
  const [subiendo, setSubiendo] = useState(0);
  const [paso, setPaso] = useState<'' | 'foto' | 'video'>('');
  const [foto, setFoto] = useState('');
  const [resultado, setResultado] = useState<{ url: string; tipo: 'foto' | 'video' } | null>(null);
  const [error, setError] = useState('');
  const vivo = useRef(true);
  useEffect(() => { vivo.current = true; return () => { vivo.current = false; }; }, []);
  useEffect(() => { onTrabajo(paso === 'foto' ? '🔁 Recrear: creando la foto…' : paso === 'video' ? '🔁 Recrear: creando el video… (tarda unos minutos)' : ''); }, [paso, onTrabajo]);

  const modelo = modelas.find((m) => m.id === modeloId) ?? modelas[0];
  const costoFoto = costo(claveFoto);
  const claveVideo = `kling-3.0/motion-control|${calidad}`;
  const estVideo = viral?.tipo === 'video' ? estimar(claveVideo, viral.dur) : null;

  async function subir(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0]; ev.target.value = '';
    if (!f) return;
    setError(''); setResultado(null); setFoto(''); setViral(null);
    try {
      if (f.type.startsWith('video/') || /\.(mp4|mov|webm)$/i.test(f.name)) {
        const dur = await duracionArchivo(f).catch(() => 0);
        if (dur && (dur < 3 || dur > 30)) { setError(`El video tiene que durar de 3 a 30 segundos (este dura ${Math.round(dur)} s). Recortalo y subilo de nuevo.`); return; }
        setSubiendo(1);
        const c = await cuadroDeArchivo(f, 0.2);
        if (!c) throw new Error('No se pudo leer el video. Probá con otro archivo.');
        const [cuadro, url] = await Promise.all([
          subirImagen(new File([c.blob], 'cuadro.jpg', { type: c.blob.type || 'image/jpeg' })),
          subirAMotion(f, `recrear-${crypto.randomUUID()}`, (x) => setSubiendo(Math.max(1, x))),
        ]);
        setViral({ tipo: 'video', url, cuadro, dur: dur || 10, w: c.w, h: c.h });
      } else {
        setSubiendo(1);
        const url = await subirImagen(f);
        const { w, h } = await new Promise<{ w: number; h: number }>((ok) => {
          const im = new window.Image();
          im.onload = () => ok({ w: im.naturalWidth, h: im.naturalHeight });
          im.onerror = () => ok({ w: 3, h: 4 });
          im.src = url;
        });
        setViral({ tipo: 'foto', url, w, h });
      }
    } catch (e) {
      setError(`No se pudo subir. ${e instanceof Error && e.message ? e.message : 'Probá de nuevo.'}`);
    } finally { setSubiendo(0); }
  }

  /** Paso 1 (y único en foto): tu modelo en la misma foto / primer cuadro. */
  async function crearFoto() {
    if (!viral || !modelo || paso) return;
    const c = costoFoto;
    if (!window.confirm(`Crear la foto de ${modelo.nombre || 'tu modelo'} en la misma toma.\n\nCuesta ≈ ${c !== null ? `${fmt(c)} créditos (${usd(c)})` : 'lo de una foto'}.${viral.tipo === 'video' ? '\n\nDespués la ves y decidís si seguís con el video.' : ''}\n\n¿Seguimos?`)) return;
    setError(''); setResultado(null); setFoto(''); setPaso('foto');
    try {
      const cuerpo = modelo.entero || modelo.medio || '';
      const conCuerpo = !!cuerpo && !modelo.refs.includes(cuerpo);
      const base = viral.tipo === 'video' ? viral.cuadro : viral.url;
      const imageUrls = [base, ...modelo.refs.slice(0, 5), ...(conCuerpo ? [cuerpo] : [])];
      const prompt = componerRecrear(viral.tipo === 'video', modelo.refs.length > 0, modelo.cuerpo, modelo.promptFijo, conCuerpo);
      const aspect = aspectoMasCercano(viral.w, viral.h);
      const res = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, imageUrls, aspect, modelo: 'seedream' }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.taskId) throw new Error(d.error ?? 'No se pudo crear la foto.');
      const r = await esperarTarea(d.taskId, () => vivo.current);
      onCreacion({ url: r.url, prompt, refs: imageUrls, aspect, credits: r.credits });
      onSaldo();
      if (viral.tipo === 'foto') setResultado({ url: r.url, tipo: 'foto' });
      else setFoto(r.url);
    } catch (e) {
      if (!(e instanceof Error && e.message === 'cancelado')) setError(e instanceof Error ? e.message : 'No se pudo crear la foto.');
    } finally { if (vivo.current) setPaso(''); }
  }

  /** Paso 2 (video): la foto aprobada copia los movimientos del viral. */
  async function crearVideo() {
    if (!viral || viral.tipo !== 'video' || !foto || !modelo || paso) return;
    const c = estVideo?.creditos ?? null;
    if (!window.confirm(`Crear el video: ${modelo.nombre || 'tu modelo'} hace los mismos movimientos del viral, con el sonido original (${calidad}).\n\nCuesta ≈ ${c !== null ? `${fmt(c)} créditos (${usd(c)})` : 'lo que cobre Kie (todavía no hay un video anterior para calcularlo)'}. Al terminar se cobra lo real.\n\n¿Seguimos?`)) return;
    setError(''); setPaso('video');
    try {
      const res = await fetch('/api/motion', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modo: 'mover', imageUrl: foto, videoUrl: viral.url, orientacion: 'video', calidad, cuerpo: modelo.cuerpo, fijo: modelo.promptFijo, audioOriginal: viral.url, dur: viral.dur }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.taskId) throw new Error(d.error ?? 'No se pudo crear el video.');
      const r = await esperarTarea(d.taskId, () => vivo.current);
      if (r.aviso) setError(r.aviso);
      onVideo(r.url); onSaldo();
      setResultado({ url: r.url, tipo: 'video' });
    } catch (e) {
      if (!(e instanceof Error && e.message === 'cancelado')) setError(e instanceof Error ? e.message : 'No se pudo crear el video.');
    } finally { if (vivo.current) setPaso(''); }
  }

  return (
    <div className="vr">
      <p className="sub" style={{ marginTop: 0 }}>Subí un video o una foto viral y lo recreamos con tu modelo: misma toma, mismos movimientos.</p>

      {/* 1. El viral */}
      <div className="panel vr-paso">
        <div className="vr-tit"><span className="vr-n">1</span> El viral</div>
        {viral ? (
          viral.tipo === 'video'
            ? <video className="vr-vid" src={viral.url} controls playsInline preload="metadata" />
            : <div style={{ position: 'relative', width: '100%', aspectRatio: `${viral.w} / ${viral.h}`, maxHeight: 420, borderRadius: 12, overflow: 'hidden' }}><Image src={viral.url} alt="Foto viral" fill sizes="400px" style={{ objectFit: 'contain' }} /></div>
        ) : null}
        <label className={viral ? 'btn-soft' : 'btn-grad'} style={{ display: 'block', textAlign: 'center', marginTop: viral ? 8 : 0, cursor: subiendo ? 'wait' : 'pointer', padding: '12px 14px' }}>
          <input type="file" accept="video/*,image/*" style={{ display: 'none' }} disabled={!!subiendo || !!paso} onChange={subir} />
          {subiendo ? `Subiendo… ${subiendo}%` : viral ? '🔄 Cambiar el viral' : '⬆ Subir video (3 a 30 s) o foto'}
        </label>
        {viral?.tipo === 'video' ? <p className="vr-nota">{Math.round(viral.dur)} s · se mantiene el sonido original.</p> : null}
        {!viral ? <p className="vr-nota">Desde Instagram o TikTok: guardá el video en el celular y subilo acá.</p> : null}
      </div>

      {/* 2. Tu modelo */}
      <div className="panel vr-paso">
        <div className="vr-tit"><span className="vr-n">2</span> Tu modelo</div>
        <div className="vr-fotos">
          {modelas.map((m) => (
            <button key={m.id} className={`lz-th ${m.id === modelo?.id ? 'on' : ''}`} style={{ width: '100%', height: 'auto', aspectRatio: '3 / 4' }} disabled={!!paso} onClick={() => { setModeloId(m.id); setFoto(''); }} title={m.nombre}>
              {m.refs[0] ? <Image src={m.refs[0]} alt={m.nombre} fill sizes="80px" /> : <span>🙂</span>}
              <small style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,.55)', color: '#fff', fontSize: 11, padding: '2px 4px', textAlign: 'center' }}>{m.nombre || 'Sin nombre'}</small>
            </button>
          ))}
        </div>
        {modelo && !modelo.refs.length ? <p className="vr-nota">⚠️ Este personaje no tiene fotos de cara: cargalas en Crear para que salga igual.</p> : null}
      </div>

      {/* 3. Recrear */}
      <div className="panel vr-paso">
        <div className="vr-tit"><span className="vr-n">3</span> Recrear</div>
        {viral?.tipo === 'video' ? (
          <div className="lz-chips" style={{ marginBottom: 8 }}>
            <button className={`opt ${calidad === '720p' ? 'on' : ''}`} disabled={!!paso} onClick={() => setCalidad('720p')}>720p</button>
            <button className={`opt ${calidad === '1080p' ? 'on' : ''}`} disabled={!!paso} onClick={() => setCalidad('1080p')}>1080p</button>
          </div>
        ) : null}

        {!foto || viral?.tipo !== 'video' ? (
          <button className={`btn-grad shine ${paso === 'foto' ? 'busy' : ''}`} style={{ width: '100%' }} disabled={!viral || !modelo || !!paso || !!subiendo} onClick={crearFoto}>
            {paso === 'foto' ? 'Creando la foto… (~1 min)' : viral?.tipo === 'video' ? '🔁 Recrear · paso 1: la foto' : '🔁 Recrear'}
          </button>
        ) : (
          <>
            <p className="vr-nota" style={{ marginTop: 0 }}>Así arranca el video. ¿Te gusta?</p>
            <div style={{ position: 'relative', width: '100%', aspectRatio: `${viral.w} / ${viral.h}`, maxHeight: 420, borderRadius: 12, overflow: 'hidden', marginBottom: 8 }}>
              <Image src={foto} alt="Primer cuadro con tu modelo" fill sizes="400px" style={{ objectFit: 'contain' }} />
            </div>
            <button className={`btn-grad shine ${paso === 'video' ? 'busy' : ''}`} style={{ width: '100%' }} disabled={!!paso} onClick={crearVideo}>
              {paso === 'video' ? 'Creando el video… (puede tardar varios minutos)' : `🎬 Sí, crear el video${estVideo ? ` · ≈ ${fmt(estVideo.creditos)} créditos (${usd(estVideo.creditos)})` : ''}`}
            </button>
            <button className="btn-soft" style={{ width: '100%', marginTop: 8 }} disabled={!!paso} onClick={crearFoto}>🔄 No, probar otra foto</button>
          </>
        )}
        <p className="vr-nota">
          {viral?.tipo === 'video'
            ? `Foto ≈ ${costoFoto !== null ? `${fmt(costoFoto)} créditos` : 'unos pocos créditos'} + video ≈ ${estVideo ? `${fmt(estVideo.creditos)} créditos` : 'según lo que cobre Kie'}. El video se crea solo si aprobás la foto.`
            : `Cuesta ≈ ${costoFoto !== null ? `${fmt(costoFoto)} créditos (${usd(costoFoto)})` : 'lo de una foto'}.`}
        </p>

        {resultado ? (
          <div style={{ marginTop: 10 }}>
            {resultado.tipo === 'video'
              ? <video className="vr-vid" src={resultado.url} controls playsInline preload="metadata" />
              : <div style={{ position: 'relative', width: '100%', aspectRatio: viral ? `${viral.w} / ${viral.h}` : '3 / 4', maxHeight: 480, borderRadius: 12, overflow: 'hidden' }}><Image src={resultado.url} alt="Resultado" fill sizes="400px" style={{ objectFit: 'contain' }} /></div>}
            <p className="costo ok" style={{ marginTop: 8 }}>✅ Listo. Ya está en tu Galería{resultado.tipo === 'video' ? ' (se borra a los 2 días, descargalo)' : ''}.</p>
            <button className="btn-grad" style={{ width: '100%' }} onClick={() => onGuardar(resultado.url, resultado.tipo)}>⬇ Guardar en el celular</button>
          </div>
        ) : null}
        {error ? <p className="errbox" style={{ marginTop: 10 }}>{error}</p> : null}
      </div>
    </div>
  );
}
