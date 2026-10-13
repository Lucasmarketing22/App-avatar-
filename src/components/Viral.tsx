'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';

import {
  aspectoMasCercano, cuadroDeArchivo, cuadroDeVideo, duracionArchivo, esperarTarea, prefSinSonido, quitarSonido, subirAMotion, subirImagen,
} from '@/lib/cliente/video';
import { componerNodoFoto, type RolImagen } from '@/lib/estudio/prompt';
import { VIRALES, type TipoViral } from '@/lib/estudio/virales';
import ElegirSonido from '@/components/ElegirSonido';

type Modelo = { id: string; nombre: string; refs: string[]; cuerpo?: string; entero?: string; medio?: string; promptFijo?: string };
type Props = {
  modelas: Modelo[];
  activoId: string;
  escenas: { url: string }[];
  vestidos: { url: string }[];
  galeria: { url: string }[];
  costo: (clave: string) => number | null;
  claveFoto: (modelo: string) => string;
  onCreacion: (c: { url: string; prompt: string; modelo: string; refs: string[]; aspect: string; credits?: number }) => void;
  onVideo: (url: string) => void;
  onTrabajo: (msg: string) => void;
  onPublicar: (url: string, tipo: 'foto' | 'video') => void;
  onGuardar: (url: string, tipo: 'foto' | 'video') => void;
  onSaldo: () => void;
};

/** Todo lo que hay que recordar (se guarda en el celu por si se cierra la app). */
type Estado = {
  tipo: TipoViral | '';
  video: { url: string; dur: number; mb: number; mudo: boolean } | null;
  cuadro: { url: string; asp: string; t: number } | null;
  instr: string;
  fondo: 'video' | 'texto' | 'escena';
  fondoTexto: string;
  fondoUrl: string;
  ropa: 'video' | 'vestido' | 'texto';
  ropaUrl: string;
  ropaTexto: string;
  carasExtra: string[];
  fotoModelo: string;
  fotos: string[];
  elegida: string;
  fotoTask: string;
  fotoCred?: number;
  motor: 'kling3' | 'kling26' | 'wan';
  calidad: string;
  videoTask: string;
  resultado: string;
  videoCred?: number;
};
const VACIO: Estado = { tipo: '', video: null, cuadro: null, instr: '', fondo: 'video', fondoTexto: '', fondoUrl: '', ropa: 'video', ropaUrl: '', ropaTexto: '', carasExtra: [], fotoModelo: 'seedream', fotos: [], elegida: '', fotoTask: '', motor: 'kling3', calidad: '720p', videoTask: '', resultado: '' };
const CLAVE = 'musa-viral-v1';
const fmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString('es-AR');
const usd = (n: number) => `≈ US$ ${(n * 0.005).toFixed(2).replace('.', ',')}`;

export default function Viral(props: Props) {
  const { modelas, activoId, escenas, vestidos, galeria, costo, claveFoto, onCreacion, onVideo, onTrabajo, onPublicar, onGuardar, onSaldo } = props;
  const [e, setE] = useState<Estado>(VACIO);
  const eRef = useRef(e); eRef.current = e;
  const set = (p: Partial<Estado>) => setE((x) => ({ ...x, ...p }));
  const [sinSonido, setSinSonido] = useState(true);
  useEffect(() => { setSinSonido(prefSinSonido()); }, []);
  const [subiendo, setSubiendo] = useState(0);
  const [quitando, setQuitando] = useState(false);
  const [capturando, setCapturando] = useState(false);
  const [creandoFoto, setCreandoFoto] = useState(false);
  const [creandoVideo, setCreandoVideo] = useState(false);
  const [error, setError] = useState('');
  const [t, setT] = useState(0.3);
  const [dur, setDur] = useState(0);
  const vidRef = useRef<HTMLVideoElement | null>(null);
  const vivo = useRef(true);

  const modelo = modelas.find((m) => m.id === activoId) ?? modelas[0];
  const def = VIRALES.find((v) => v.id === e.tipo);

  /* ----- recordar el progreso en el celu ----- */
  const [listo, setListo] = useState(false);
  useEffect(() => {
    vivo.current = true;
    try { const s = localStorage.getItem(CLAVE); if (s) { const x = JSON.parse(s) as Estado; setE({ ...VACIO, ...x }); if (x.cuadro) setT(x.cuadro.t); } } catch { /* */ }
    setListo(true);
    return () => { vivo.current = false; };
  }, []);
  useEffect(() => { if (!listo) return; try { localStorage.setItem(CLAVE, JSON.stringify(e)); } catch { /* */ } }, [e, listo]);
  // Si quedó algo creándose (se cerró la app), lo seguimos esperando.
  useEffect(() => {
    if (!listo) return;
    const x = eRef.current;
    if (x.fotoTask) terminarFoto(x.fotoTask, '', [], x.cuadro?.asp);
    if (x.videoTask) terminarVideo(x.videoTask);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listo]);

  useEffect(() => {
    onTrabajo(creandoFoto ? '🔥 Viral: creando la foto inicial…' : creandoVideo ? '🔥 Viral: creando el video…' : quitando ? '🔥 Viral: quitando el sonido…' : '');
  }, [creandoFoto, creandoVideo, quitando, onTrabajo]);

  function empezarOtro() {
    if ((creandoFoto || creandoVideo) && !window.confirm('Hay algo creándose. ¿Empezar otro igual? (lo que termine va a aparecer en tu galería)')) return;
    setE({ ...VACIO, tipo: e.tipo }); setError(''); setT(0.3);
  }

  /* ----- paso 2: video ----- */
  async function onVideoFile(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0]; ev.target.value = '';
    if (!f) return;
    setError('');
    if (f.size > 100 * 1024 * 1024) { setError('El video pesa más de 100 MB. Recortalo y volvé a subirlo.'); return; }
    const d = await duracionArchivo(f);
    if (d && d < 3) { setError('El video tiene que durar al menos 3 segundos.'); return; }
    if (d > 30.5) { setError(`El video dura ${Math.round(d)} s y el máximo es 30. Recortalo y volvé a subirlo.`); return; }
    set({ video: null, cuadro: null, fotos: [], elegida: '', resultado: '' });
    setSubiendo(1);
    // La captura del principio sale del archivo del celu (rápido y sin depender de internet).
    const cap = cuadroDeArchivo(f).then(async (r) => (r ? { url: await subirImagen(new File([r.blob], 'captura.jpg', { type: 'image/jpeg' })), asp: aspectoMasCercano(r.w, r.h), t: 0.3 } : null)).catch(() => null);
    try {
      let url = await subirAMotion(f, 'viral', setSubiendo);
      let mb = f.size / (1024 * 1024); let mudo = false;
      setSubiendo(0);
      if (sinSonido) {
        setQuitando(true);
        try { const r = await quitarSonido(url); url = r.url; mb = r.mb || mb; mudo = true; } catch (er) { setError(`Se subió CON sonido: ${er instanceof Error ? er.message : 'no se pudo quitar'}.`); } finally { setQuitando(false); }
      }
      set({ video: { url, dur: d, mb, mudo } });
      const c = await cap;
      if (c) { set({ cuadro: c }); setT(0.3); }
    } catch (er) {
      setError(er instanceof Error && er.message ? `No se pudo subir: ${er.message}` : 'No se pudo subir el video.');
    } finally { setSubiendo(0); setQuitando(false); }
  }
  async function usarMomento() {
    const v = vidRef.current;
    if (!v) return;
    setCapturando(true); setError('');
    try {
      const r = await cuadroDeVideo(v);
      if (!r) throw new Error();
      const url = await subirImagen(new File([r.blob], 'captura.jpg', { type: 'image/jpeg' }));
      set({ cuadro: { url, asp: aspectoMasCercano(r.w, r.h), t }, fotos: [], elegida: '' });
    } catch { setError('No pude tomar la captura en este celu. Subí una captura de pantalla del video.'); } finally { setCapturando(false); }
  }
  async function subirCaptura(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0]; ev.target.value = '';
    if (!f) return;
    setCapturando(true);
    try { set({ cuadro: { url: await subirImagen(f), asp: e.cuadro?.asp || '9:16', t }, fotos: [], elegida: '' }); } catch { setError('No se pudo subir la captura.'); } finally { setCapturando(false); }
  }

  const [subiendoCara, setSubiendoCara] = useState(false);
  const [verGaleria, setVerGaleria] = useState(false);
  async function subirCaraExtra(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0]; ev.target.value = '';
    if (!f) return;
    setSubiendoCara(true); setError('');
    try { const u = await subirImagen(f); setE((x) => ({ ...x, carasExtra: [...x.carasExtra, u].slice(-3) })); } catch { setError('No se pudo subir la foto.'); } finally { setSubiendoCara(false); }
  }
  function tocarCaraExtra(u: string) {
    setE((x) => ({ ...x, carasExtra: x.carasExtra.includes(u) ? x.carasExtra.filter((y) => y !== u) : [...x.carasExtra, u].slice(-3) }));
  }
  const [subiendoRopa, setSubiendoRopa] = useState(false);
  async function subirRopa(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0]; ev.target.value = '';
    if (!f) return;
    setSubiendoRopa(true); setError('');
    try { set({ ropa: 'vestido', ropaUrl: await subirImagen(f) }); } catch { setError('No se pudo subir la foto de la ropa.'); } finally { setSubiendoRopa(false); }
  }

  /* ----- paso 3: foto inicial ----- */
  async function crearFoto() {
    if (!def || !e.cuadro || !modelo || creandoFoto) return;
    if (!modelo.refs.length) { setError(`${modelo.nombre || 'Tu modelo'} no tiene fotos de cara. Cargalas en su ficha.`); return; }
    setError(''); setCreandoFoto(true);
    const cuerpo = modelo.entero || modelo.medio;
    if (e.fondo === 'texto' && !e.fondoTexto.trim()) { setError('Escribí qué lugar querés de fondo (o elegí "Igual al video").'); setCreandoFoto(false); return; }
    if (e.fondo === 'escena' && !e.fondoUrl) { setError('Elegí una escena de tu galería para el fondo.'); setCreandoFoto(false); return; }
    if (e.ropa === 'vestido' && !e.ropaUrl) { setError('Elegí o subí la ropa que querés ponerle.'); setCreandoFoto(false); return; }
    if (e.ropa === 'texto' && !e.ropaTexto.trim()) { setError('Escribí qué ropa querés (o elegí "Igual al video").'); setCreandoFoto(false); return; }
    const items: { url: string; rol: RolImagen }[] = [
      { url: e.cuadro.url, rol: 'captura' },
      ...modelo.refs.slice(0, 3).map((url) => ({ url, rol: 'cara' as const })),
      ...e.carasExtra.filter((u) => !modelo.refs.includes(u)).slice(0, 3).map((url) => ({ url, rol: 'cara' as const })),
      ...(def.conCuerpo && cuerpo ? [{ url: cuerpo, rol: 'cuerpo' as const }] : []),
      ...(e.fondo === 'escena' && e.fondoUrl ? [{ url: e.fondoUrl, rol: 'escena' as const }] : []),
      ...(e.ropa === 'vestido' && e.ropaUrl ? [{ url: e.ropaUrl, rol: 'vestuario' as const }] : []),
    ];
    const ropa = e.ropa === 'video'
      ? 'Same outfit as the person in the video frame.'
      : e.ropa === 'texto'
        ? `OUTFIT CHANGE: dress her in ${e.ropaTexto.trim()} instead of the clothes of the video frame (do not keep any garment of the frame). Keep the exact pose and framing.`
        : 'OUTFIT CHANGE: dress her in the outfit of the outfit reference image instead of the clothes of the video frame (do not keep any garment of the frame). Keep the exact pose and framing.';
    const fondo = e.fondo === 'texto'
      ? `Change ONLY the place and background to: ${e.fondoTexto.trim()} — a real, believable location. Keep EXACTLY the same pose, framing, camera angle, distance and light direction of the video frame; nothing of the original background may remain.`
      : '';
    const prompt = componerNodoFoto(items.map((x) => x.rol), [def.pistaFoto, ropa, fondo, e.instr], modelo.cuerpo, modelo.promptFijo);
    const imageUrls = items.map((x) => x.url);
    const aspect = e.cuadro.asp || '9:16';
    try {
      const res = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, imageUrls, aspect, modelo: e.fotoModelo }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.taskId) throw new Error(d.error ?? 'No se pudo crear la foto.');
      set({ fotoTask: d.taskId });
      await terminarFoto(d.taskId, prompt, imageUrls, aspect);
    } catch (er) {
      if (vivo.current) { setError(er instanceof Error ? er.message : 'No se pudo crear la foto.'); set({ fotoTask: '' }); setCreandoFoto(false); }
    }
  }
  async function terminarFoto(taskId: string, prompt: string, imageUrls: string[], aspect = '9:16') {
    setCreandoFoto(true);
    try {
      const r = await esperarTarea(taskId, () => vivo.current);
      setE((x) => ({ ...x, fotoTask: '', fotos: [r.url, ...x.fotos].slice(0, 6), fotoCred: r.credits }));
      onCreacion({ url: r.url, prompt: prompt || 'Recrear viral: foto inicial', modelo: eRef.current.fotoModelo, refs: imageUrls, aspect, credits: r.credits });
      onSaldo();
    } catch (er) {
      if (vivo.current && !(er instanceof Error && er.message === 'cancelado')) { setError(er instanceof Error ? er.message : 'Error.'); set({ fotoTask: '' }); }
    } finally { if (vivo.current) setCreandoFoto(false); }
  }

  /* ----- paso 4: video ----- */
  async function crearVideo() {
    if (!def || !e.video || !e.elegida || creandoVideo) return;
    if (e.motor === 'wan' && e.video.mb > 10) { setError(`Para "Reemplazar" el video tiene que pesar hasta 10 MB (pesa ${fmt(e.video.mb)} MB).`); return; }
    setError(''); setCreandoVideo(true);
    try {
      const res = await fetch('/api/motion', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modo: e.motor === 'wan' ? 'reemplazar' : 'mover', motor: e.motor, imageUrl: e.elegida, videoUrl: e.video.url,
          orientacion: 'video', calidad: e.calidad, cuerpo: modelo?.cuerpo, fijo: modelo?.promptFijo, prompt: [def.pistaVideo, e.instr].filter(Boolean).join(' '),
          // Subido CON sonido: el video final sale con ese mismo audio.
          audioOriginal: e.video.mudo ? undefined : e.video.url,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.taskId) throw new Error(d.error ?? 'No se pudo crear el video.');
      set({ videoTask: d.taskId });
      await terminarVideo(d.taskId);
    } catch (er) {
      if (vivo.current) { setError(er instanceof Error ? er.message : 'No se pudo crear el video.'); set({ videoTask: '' }); setCreandoVideo(false); }
    }
  }
  async function terminarVideo(taskId: string) {
    setCreandoVideo(true);
    try {
      const r = await esperarTarea(taskId, () => vivo.current);
      if (r.aviso) setError(r.aviso);
      set({ videoTask: '', resultado: r.url, videoCred: r.credits });
      onVideo(r.url); onSaldo();
    } catch (er) {
      if (vivo.current && !(er instanceof Error && er.message === 'cancelado')) { setError(er instanceof Error ? er.message : 'Error.'); set({ videoTask: '' }); }
    } finally { if (vivo.current) setCreandoVideo(false); }
  }

  const costoFoto = costo(claveFoto(e.fotoModelo));
  const claveVideo = e.motor === 'wan' ? `wan/2-2-animate-replace|${e.calidad}` : `${e.motor === 'kling26' ? 'kling-2.6' : 'kling-3.0'}/motion-control|${e.calidad}`;
  const costoVideo = costo(claveVideo);
  const calidades = e.motor === 'wan' ? ['480p', '720p'] : ['720p', '1080p'];

  /* ===================== Render ===================== */
  return (
    <div className="vr">
      <p className="sub" style={{ marginTop: 0 }}>Subí un video viral y lo recreamos con <b>{modelo?.nombre || 'tu modelo'}</b>: misma toma, mismos gestos. Vos aprobás la foto antes de gastar en el video.</p>

      {/* 1. Tipo */}
      <div className="panel vr-paso">
        <div className="vr-tit"><span className="vr-n">1</span> ¿Qué tipo de video es?</div>
        <div className="vr-tipos">
          {VIRALES.map((v) => (
            <button key={v.id} className={`vr-tipo ${e.tipo === v.id ? 'on' : ''}`} onClick={() => set({ tipo: v.id, motor: 'kling3', calidad: '720p' })}>
              <span className="vr-emo">{v.emoji}</span><b>{v.titulo}</b><span>{v.desc}</span>
            </button>
          ))}
        </div>
        {def ? <p className="vr-tip">💡 {def.tip}</p> : null}
      </div>

      {/* 2. Video */}
      {def ? (
        <div className="panel vr-paso">
          <div className="vr-tit"><span className="vr-n">2</span> Subí el video viral</div>
          {e.video ? (
            <>
              <video
                ref={vidRef} className="vr-vid" crossOrigin="anonymous" src={e.video.url} muted playsInline controls preload="auto"
                onLoadedMetadata={(ev) => { const v = ev.currentTarget; setDur(v.duration || 0); v.currentTime = Math.min(t, v.duration || t); }}
                onError={() => setError('Este video ya no está (se borran a los 2 días). Subilo de nuevo.')}
              />
              <p className="vr-nota">{Math.round(e.video.dur) || '?'} s · {fmt(e.video.mb)} MB{e.video.mudo ? ' · 🔇 sin sonido' : ' · 🔊 con sonido'}</p>
              <div className="vr-tit chico">¿Desde qué momento arranca?</div>
              <input type="range" className="lz-slider" min={0} max={Math.max(0.1, dur - 0.05)} step={0.05} value={Math.min(t, dur || t)}
                onChange={(ev) => { const x = Number(ev.target.value); setT(x); if (vidRef.current) vidRef.current.currentTime = x; }} />
              <div className="vr-fila">
                <button className="btn-soft" disabled={capturando} onClick={usarMomento}>{capturando ? 'Guardando…' : `📸 Usar el segundo ${t.toFixed(1)}`}</button>
                <label className="btn-ghost vr-lbl"><input type="file" accept="image/*" onChange={subirCaptura} style={{ display: 'none' }} />o subir captura</label>
              </div>
              {e.cuadro ? (
                <div className="vr-cap"><span className="vr-th"><Image src={e.cuadro.url} alt="" fill sizes="70px" /></span><span className="vr-nota">✓ La foto de {modelo?.nombre || 'tu modelo'} va a arrancar <b>exactamente así</b> (segundo {e.cuadro.t.toFixed(1)}).</span></div>
              ) : <p className="vr-nota">Tomando la captura…</p>}
              <label className="btn-ghost vr-lbl" style={{ marginTop: 10 }}>
                <input type="file" accept="video/mp4,video/quicktime,video/webm,video/*" onChange={onVideoFile} style={{ display: 'none' }} disabled={subiendo > 0 || quitando} />🔄 Cambiar video
              </label>
            </>
          ) : (
            <>
              <label className="upload-tile vr-up">
                <input type="file" accept="video/mp4,video/quicktime,video/webm,video/*" onChange={onVideoFile} style={{ display: 'none' }} disabled={subiendo > 0 || quitando} />
                <span style={{ fontSize: 28, color: 'var(--rosa)' }}>＋</span>
                <span className="sub" style={{ fontSize: 13 }}>{quitando ? '🔇 Quitando el sonido…' : subiendo ? `Subiendo… ${subiendo}%` : 'Subir video (3 a 30 s)'}</span>
              </label>
              <ElegirSonido sin={sinSonido} onCambio={setSinSonido} />
            </>
          )}
        </div>
      ) : null}

      {/* 3. Foto inicial */}
      {def && e.video && e.cuadro ? (
        <div className="panel vr-paso">
          <div className="vr-tit"><span className="vr-n">3</span> Foto inicial de {modelo?.nombre || 'tu modelo'}</div>
          <p className="vr-nota" style={{ marginTop: 0 }}>Se crea en la misma toma que el video. Si no te convence, creá otra antes de gastar en el video.</p>
          <div className="vr-tit chico">🙂 Más fotos de su cara <span className="vr-nota" style={{ margin: 0, fontWeight: 600 }}>(opcional, hasta 3)</span></div>
          <div className="vr-fotos" style={{ marginBottom: 6 }}>
            <label className="lz-th vr-subir" style={{ width: '100%', height: 'auto', aspectRatio: '3 / 4' }}>
              <input type="file" accept="image/*" onChange={subirCaraExtra} style={{ display: 'none' }} disabled={subiendoCara || e.carasExtra.length >= 3} />
              <span>{subiendoCara ? '…' : '＋'}</span><small>{subiendoCara ? 'Subiendo' : 'Subir'}</small>
            </label>
            {e.carasExtra.map((u) => (
              <button key={u} className="lz-th on" style={{ width: '100%', height: 'auto', aspectRatio: '3 / 4' }} onClick={() => tocarCaraExtra(u)} title="Quitar">
                <Image src={u} alt="" fill sizes="80px" /><span className="vr-quitar">×</span>
              </button>
            ))}
            {galeria.length ? <button className="lz-th vr-subir" style={{ width: '100%', height: 'auto', aspectRatio: '3 / 4' }} onClick={() => setVerGaleria((x) => !x)}><span>🖼️</span><small>{verGaleria ? 'Cerrar' : 'Galería'}</small></button> : null}
          </div>
          {verGaleria ? (
            <div className="vr-fotos vr-gal" style={{ marginBottom: 6 }}>
              {galeria.slice(0, 24).map((g) => (
                <button key={g.url} className={`lz-th ${e.carasExtra.includes(g.url) ? 'on' : ''}`} style={{ width: '100%', height: 'auto', aspectRatio: '3 / 4' }} onClick={() => tocarCaraExtra(g.url)}>
                  <Image src={g.url} alt="" fill sizes="80px" />
                </button>
              ))}
            </div>
          ) : null}
          <p className="vr-nota" style={{ marginTop: 0, marginBottom: 8 }}>Sumá fotos donde {modelo?.nombre || 'tu modelo'} salió perfecta: más motivos para que la IA respete su cara (además de las de su ficha).</p>
          <div className="vr-tit chico">👗 Ropa</div>
          <div className="lz-chips">
            <button className={`opt ${e.ropa === 'video' ? 'on' : ''}`} onClick={() => set({ ropa: 'video' })}>Igual al video</button>
            <button className={`opt ${e.ropa === 'vestido' ? 'on' : ''}`} onClick={() => set({ ropa: 'vestido' })}>De mis vestidos / foto</button>
            <button className={`opt ${e.ropa === 'texto' ? 'on' : ''}`} onClick={() => set({ ropa: 'texto' })}>Escribirla</button>
          </div>
          {e.ropa === 'vestido' ? (
            <>
              <div className="vr-fotos" style={{ marginBottom: 6 }}>
                <label className="lz-th vr-subir" style={{ width: '100%', height: 'auto', aspectRatio: '3 / 4' }}>
                  <input type="file" accept="image/*" onChange={subirRopa} style={{ display: 'none' }} disabled={subiendoRopa} />
                  <span>{subiendoRopa ? '…' : '＋'}</span><small>{subiendoRopa ? 'Subiendo' : 'Subir foto'}</small>
                </label>
                {e.ropaUrl && !vestidos.some((v) => v.url === e.ropaUrl) ? (
                  <button className="lz-th on" style={{ width: '100%', height: 'auto', aspectRatio: '3 / 4' }}><Image src={e.ropaUrl} alt="" fill sizes="80px" /></button>
                ) : null}
                {vestidos.slice(0, 15).map((v) => (
                  <button key={v.url} className={`lz-th ${e.ropaUrl === v.url ? 'on' : ''}`} style={{ width: '100%', height: 'auto', aspectRatio: '3 / 4' }} onClick={() => set({ ropaUrl: v.url })}>
                    <Image src={v.url} alt="" fill sizes="80px" />
                  </button>
                ))}
              </div>
              <p className="vr-nota" style={{ marginTop: 0, marginBottom: 8 }}>Elegí uno de tus vestidos o subí una foto de la ropa (puede ser de una tienda o de otra persona).</p>
            </>
          ) : null}
          {e.ropa === 'texto' ? (
            <input className="input" value={e.ropaTexto} onChange={(ev) => set({ ropaTexto: ev.target.value })} placeholder="Ej: vestido corto rojo ajustado, top negro de encaje y jean" style={{ width: '100%', boxSizing: 'border-box', marginBottom: 8 }} />
          ) : null}
          <div className="vr-tit chico">🏞️ Fondo</div>
          <div className="lz-chips">
            <button className={`opt ${e.fondo === 'video' ? 'on' : ''}`} onClick={() => set({ fondo: 'video' })}>Igual al video</button>
            <button className={`opt ${e.fondo === 'texto' ? 'on' : ''}`} onClick={() => set({ fondo: 'texto' })}>Otro lugar</button>
            <button className={`opt ${e.fondo === 'escena' ? 'on' : ''}`} onClick={() => set({ fondo: 'escena' })}>De mis escenas</button>
          </div>
          {e.fondo === 'texto' ? (
            <input className="input" value={e.fondoTexto} onChange={(ev) => set({ fondoTexto: ev.target.value })} placeholder="Ej: dormitorio luminoso con plantas, living moderno, playa al atardecer" style={{ width: '100%', boxSizing: 'border-box', marginBottom: 8 }} />
          ) : null}
          {e.fondo === 'escena' ? (
            escenas.length ? (
              <div className="vr-fotos" style={{ marginBottom: 8 }}>
                {escenas.slice(0, 16).map((g) => (
                  <button key={g.url} className={`lz-th ${e.fondoUrl === g.url ? 'on' : ''}`} style={{ width: '100%', height: 'auto', aspectRatio: '3 / 4' }} onClick={() => set({ fondoUrl: g.url })}>
                    <Image src={g.url} alt="" fill sizes="80px" />
                  </button>
                ))}
              </div>
            ) : <p className="vr-nota">Todavía no tenés escenas guardadas. Cargalas en Crear → Escenas, o usá “Otro lugar”.</p>
          ) : null}
          {e.fondo !== 'video' ? <p className="vr-nota" style={{ marginTop: 0, marginBottom: 8 }}>Misma postura y encuadre, en otro lugar. El video va a salir con este fondo nuevo.</p> : null}
          <textarea className="textarea" value={e.instr} onChange={(ev) => set({ instr: ev.target.value })} placeholder="¿Cambiar algo más? (opcional) Ej: pelo suelto, aros dorados" style={{ height: 60 }} />
          {modelo?.promptFijo ? <p className="vr-nota">✍️ Se suma solo el <b>prompt fijo</b> de {modelo.nombre || 'tu modelo'} (cara y medidas).</p> : <p className="vr-nota">💡 Tip: cargá el <b>✍️ Prompt fijo</b> en la ficha de {modelo?.nombre || 'tu modelo'} para que siempre respete su cara y sus medidas.</p>}
          <div className="vr-fila">
            <select className="input" value={e.fotoModelo} onChange={(ev) => set({ fotoModelo: ev.target.value })} style={{ flex: 1, minWidth: 0 }}>
              <option value="seedream">Seedream 4.5 ⭐</option>
              <option value="nanopro">Nano Banana Pro</option>
            </select>
            <button className={`btn-grad ${creandoFoto ? 'busy' : ''}`} disabled={creandoFoto} onClick={crearFoto} style={{ flex: 1.3 }}>
              {creandoFoto ? 'Creando…' : e.fotos.length ? '🔄 Crear otra' : '📸 Crear foto'}
            </button>
          </div>
          <p className="vr-nota">{costoFoto === null ? 'Costo: 1 foto.' : `${fmt(costoFoto)} créditos por foto (${usd(costoFoto)}).`}</p>
          {e.fotos.length ? (
            <>
              <div className="vr-comp">
                <div><span className="vr-big"><Image src={e.cuadro.url} alt="" fill sizes="45vw" /></span><span className="vr-cap-l">Video</span></div>
                <div><span className="vr-big"><Image src={e.elegida || e.fotos[0]} alt="" fill sizes="45vw" /></span><span className="vr-cap-l">{modelo?.nombre || 'Tu modelo'}</span></div>
              </div>
              <div className="vr-fotos">
                {e.fotos.map((u) => (
                  <button key={u} className={`lz-resit ${e.elegida === u ? 'on' : ''}`} onClick={() => set({ elegida: e.elegida === u ? '' : u })}>
                    <Image src={u} alt="" fill sizes="80px" />
                    <span className="lz-ok">{e.elegida === u ? '✅ Aprobada' : 'Aprobar'}</span>
                  </button>
                ))}
              </div>
              {!e.elegida ? <p className="vr-nota">👆 Tocá la que coincide con el video para <b>aprobarla</b>.</p> : null}
            </>
          ) : null}
        </div>
      ) : null}

      {/* 4. Video */}
      {def && e.video && e.elegida ? (
        <div className="panel vr-paso">
          <div className="vr-tit"><span className="vr-n">4</span> Crear el video</div>
          <div className="lz-chips">
            {([['kling3', 'Kling 3.0 ⭐'], ['kling26', 'Kling 2.6 (más barato)'], ['wan', 'Reemplazar']] as const).map(([id, l]) => (
              <button key={id} className={`opt ${e.motor === id ? 'on' : ''}`} onClick={() => set({ motor: id, calidad: id === 'wan' ? (e.calidad === '1080p' ? '720p' : e.calidad) : (e.calidad === '480p' ? '720p' : e.calidad) })}>{l}</button>
            ))}
          </div>
          <div className="lz-chips">
            {calidades.map((c) => <button key={c} className={`opt ${e.calidad === c ? 'on' : ''}`} onClick={() => set({ calidad: c })}>{c}</button>)}
          </div>
          {e.motor === 'kling26' && e.video.dur > 10 ? <p className="lz-err">Kling 2.6 hace hasta 10 s: tu video sale cortado.</p> : null}
          {(e.tipo === 'hablando' || e.tipo === 'rostro') && e.motor !== 'wan' && e.calidad !== '1080p' ? <p className="vr-tip" style={{ marginTop: 4 }}>💡 En videos de cara, <b>1080p</b> mantiene mejor la cara de {modelo?.nombre || 'tu modelo'} (cuesta más). Si igual cambia, probá <b>Reemplazar</b>.</p> : null}
          <button className={`btn-grad shine ${creandoVideo ? 'busy' : ''}`} style={{ width: '100%', marginTop: 6 }} disabled={creandoVideo} onClick={crearVideo}>
            {creandoVideo ? 'Creando video… (unos minutos)' : e.resultado ? '🔄 Crear otro video' : '🎬 Crear video'}
          </button>
          <p className="vr-nota">{costoVideo === null ? 'El costo lo vas a ver después del primero con este motor.' : `Último video con este motor: ${fmt(costoVideo)} créditos (${usd(costoVideo)}).`}</p>
          {e.resultado ? (
            <div style={{ marginTop: 12 }}>
              <video className="vr-vid" src={e.resultado} controls playsInline preload="metadata" />
              {typeof e.videoCred === 'number' ? <p className="vr-nota">✅ Listo · costó {fmt(e.videoCred)} créditos{typeof e.fotoCred === 'number' ? ` + ${fmt(e.fotoCred)} de la foto` : ''}.</p> : null}
              <div className="vr-fila">
                <button className="btn-soft" onClick={() => onGuardar(e.resultado, 'video')} style={{ flex: 1 }}>⬇ Guardar</button>
                <button className="btn-grad" onClick={() => onPublicar(e.resultado, 'video')} style={{ flex: 1 }}>📤 Publicar</button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="errbox" style={{ margin: '0 0 12px' }}>{error}</p> : null}
      {e.tipo ? <button className="btn-ghost" style={{ width: '100%' }} onClick={empezarOtro}>🔁 Empezar otro viral</button> : null}
    </div>
  );
}
