'use client';

import { useEffect, useRef, useState } from 'react';

import { esperarTarea, subirAMotion } from '@/lib/cliente/video';
import type { Estimado } from '@/components/ConfirmarVideo';

type Props = {
  /** El último video hecho en Escenas (se ofrece primero). */
  propio?: string;
  /** Videos recientes de la galería. */
  galeria: string[];
  estimar: (clave: string, dur: number) => Estimado;
  mult?: number;
  onVideo: (url: string) => void;
  onSaldo: () => void;
  onGuardar: (url: string, tipo: 'foto' | 'video') => void;
  onPublicar: (url: string, tipo: 'foto' | 'video') => void;
};

type Video = { url: string; dur: number; w: number; h: number };
type Estado = { video: Video | null; texto: string; task: string; resultado: string; cred?: number };
const VACIO: Estado = { video: null, texto: '', task: '', resultado: '' };
const CLAVE = 'musa-angulos-v1';
const fmt = (n: number) => Math.round(n).toLocaleString('es-AR');
const usd = (n: number) => `≈ US$ ${(n * 0.005).toFixed(2).replace('.', ',')}`;
/**
 * Kie no publica el precio con video de referencia: cobra un precio por segundo
 * más bajo sobre (segundos del video + segundos nuevos). Mientras no haya uno
 * real, se estima como el 65 % del 720p normal (63 créditos/s), lo que publica
 * otro revendedor de la misma Seedance 2.5.
 */
const SEG_ESTIMADO = 63 * 0.65;
/** Lo que acepta Seedance como video de referencia (docs.kie.ai, revisado el 26/10/2026). */
const PIXELES_MIN = 409_600;
const PIXELES_MAX = 927_408;

/** Duración y tamaño de un video (sin bajarlo entero). */
function medidas(url: string): Promise<Video | null> {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    v.onloadedmetadata = () => resolve(Number.isFinite(v.duration) ? { url, dur: v.duration, w: v.videoWidth, h: v.videoHeight } : null);
    v.onerror = () => resolve(null);
    v.src = url;
  });
}

/** Por qué este video no sirve como referencia, o null si sirve. */
function problema(v: Video): string | null {
  if (v.dur < 2 || v.dur > 30) return `Dura ${v.dur.toFixed(1).replace('.', ',')} s: tiene que durar de 2 a 30 segundos.`;
  const px = v.w * v.h;
  if (px > PIXELES_MAX) return `Es de ${v.w}×${v.h}: Seedance solo acepta videos de 720p o 480p. Usá uno creado en 720p o borrador.`;
  if (px < PIXELES_MIN) return `Es de ${v.w}×${v.h}: es demasiado chico para Seedance (mínimo 480p).`;
  const r = v.w / Math.max(1, v.h);
  if (r < 0.4 || r > 2.5) return 'Tiene un formato demasiado angosto o ancho para Seedance.';
  return null;
}

/**
 * Nuevos ángulos: el mismo video (mismas personas, palabras y tiempos) vuelto a
 * filmar desde otros ángulos, con cortes. Se pega el prompt que arma Claude con
 * la skill GenHQ Infinite Angle.
 */
export default function Angulos(props: Props) {
  const { propio, galeria, estimar, mult = 1, onVideo, onSaldo, onGuardar, onPublicar } = props;
  const [e, setE] = useState<Estado>(VACIO);
  const eRef = useRef(e); eRef.current = e;
  const set = (p: Partial<Estado>) => setE((x) => ({ ...x, ...p }));
  const [error, setError] = useState('');
  const [subiendo, setSubiendo] = useState(0);
  const [midiendo, setMidiendo] = useState(false);
  const [creando, setCreando] = useState(false);
  const [listo, setListo] = useState(false);
  const vivo = useRef(true);

  useEffect(() => {
    vivo.current = true;
    try { const s = localStorage.getItem(CLAVE); if (s) setE({ ...VACIO, ...(JSON.parse(s) as Estado) }); } catch { /* */ }
    setListo(true);
    return () => { vivo.current = false; };
  }, []);
  useEffect(() => { if (!listo) return; try { localStorage.setItem(CLAVE, JSON.stringify(e)); } catch { /* */ } }, [e, listo]);
  // Si quedó uno creándose (se cerró la app), lo seguimos esperando.
  useEffect(() => {
    if (listo && eRef.current.task) terminar(eRef.current.task);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listo]);

  async function elegir(url: string) {
    setError(''); setMidiendo(true);
    const v = await medidas(url);
    if (!vivo.current) return;
    setMidiendo(false);
    if (!v) { setError('No se pudo leer ese video. Probá con otro.'); return; }
    set({ video: v });
  }

  async function subir(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0]; ev.target.value = '';
    if (!f) return;
    setError(''); setSubiendo(1);
    try {
      const url = await subirAMotion(f, `angulos-${crypto.randomUUID()}`, (p) => setSubiendo(Math.max(1, p)));
      await elegir(url);
    } catch (er) {
      setError(er instanceof Error && er.message ? er.message : 'No se pudo subir el video.');
    } finally { setSubiendo(0); }
  }

  const v = e.video;
  const mal = v ? problema(v) : null;
  const durNueva = v ? Math.min(30, Math.max(4, Math.ceil(v.dur) + 1)) : 0;
  const segCobrados = v ? Math.ceil(v.dur) + durNueva : 0;
  const aprendido = estimar('bytedance/seedance-2-5|720p+video', segCobrados);
  const estimado = aprendido ?? { creditos: SEG_ESTIMADO * segCobrados * mult, porSegundo: true };
  const palabras = e.texto.trim().split(/\s+/).filter(Boolean).length;
  const puede = !!v && !mal && !!e.texto.trim() && !creando && !subiendo && !midiendo;

  async function crear() {
    if (!puede || !v) return;
    const aviso = aprendido ? '' : '\n\nKie no publica este precio exacto: es una estimación, al terminar se cobra lo real.';
    if (!window.confirm(`Nuevos ángulos de un video de ${v.dur.toFixed(1).replace('.', ',')} s (sale de ${durNueva} s, en 720p).\n\nVa a costar ≈ ${fmt(estimado?.creditos ?? 0)} créditos (${usd(estimado?.creditos ?? 0)}).${aviso}\n\n¿Seguimos?`)) return;
    setError(''); setCreando(true);
    try {
      const res = await fetch('/api/escena', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'angulos', video: v.url, durVideo: v.dur, texto: e.texto }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.taskId) throw new Error(d.error ?? 'No se pudo crear el video.');
      set({ task: d.taskId });
      await terminar(d.taskId);
    } catch (er) {
      if (vivo.current) { setError(er instanceof Error ? er.message : 'No se pudo crear el video.'); set({ task: '' }); setCreando(false); }
    }
  }

  async function terminar(taskId: string) {
    setCreando(true);
    try {
      let r: Awaited<ReturnType<typeof esperarTarea>> | null = null;
      // Si la espera se corta (video largo), se vuelve a esperar: la tarea sigue en la IA.
      for (let i = 0; !r; i++) {
        try { r = await esperarTarea(taskId, () => vivo.current); } catch (er) {
          if (i < 2 && er instanceof Error && er.message.startsWith('Tardó demasiado')) continue;
          throw er;
        }
      }
      if (r.aviso) setError(r.aviso);
      set({ task: '', resultado: r.url, cred: r.credits });
      onVideo(r.url); onSaldo();
    } catch (er) {
      if (vivo.current && !(er instanceof Error && er.message === 'cancelado')) { setError(er instanceof Error ? er.message : 'Error.'); set({ task: '' }); }
    } finally { if (vivo.current) setCreando(false); }
  }

  const opciones = [...new Set([propio, ...galeria].filter((u): u is string => !!u))].slice(0, 9);

  return (
    <div className="panel vr-paso hb-paso">
      <div className="vr-tit"><span className="vr-n">4</span> 🎥 Nuevos ángulos</div>
      <p className="vr-nota" style={{ marginTop: 0 }}>El mismo video, con las mismas personas, palabras y tiempos, <b>vuelto a filmar desde otros ángulos</b> (primeros planos, perfil, desde arriba…). Elegí un video de 2 a 30 s en 720p o borrador y pegá el prompt de nuevos ángulos que te paso.</p>

      <div className="vr-tit chico">🎞️ El video</div>
      <div className="vr-fotos" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <label className="lz-th vr-subir" style={{ width: '100%', height: 'auto', aspectRatio: '9 / 16' }}>
          <input type="file" accept="video/*" onChange={subir} style={{ display: 'none' }} disabled={!!subiendo || creando} />
          <span>{subiendo ? `${subiendo}%` : '＋'}</span><small>{subiendo ? 'Subiendo' : 'Subir video'}</small>
        </label>
        {opciones.map((u) => (
          <button key={u} type="button" onClick={() => elegir(u)} disabled={creando} aria-label="Usar este video"
            className="lz-th" style={{ width: '100%', height: 'auto', aspectRatio: '9 / 16', padding: 0, cursor: 'pointer', overflow: 'hidden', outline: v?.url === u ? '3px solid var(--rosa)' : 'none', outlineOffset: -3 }}>
            <video src={u} muted playsInline preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </button>
        ))}
      </div>
      {midiendo ? <p className="vr-nota">Revisando el video…</p> : null}
      {v ? (
        <p className={mal ? 'lz-err' : 'vr-nota'}>{mal ?? `✅ ${v.dur.toFixed(1).replace('.', ',')} s · ${v.w}×${v.h}. Sale un video nuevo de ${durNueva} s en 720p.`}</p>
      ) : null}

      <div className="vr-tit chico">✍️ Prompt de nuevos ángulos</div>
      <textarea
        className="textarea" value={e.texto} onChange={(ev) => set({ texto: ev.target.value })} style={{ height: 200 }}
        placeholder={'Ej: Keep everything in @Video1 exactly the same — the woman, her words and lip sync, every movement at the same moment, the location, the light, the phone look. Only the camera angle changes. Never use @Video1\'s front selfie angle at arm\'s length.\n\n0:00–0:03 — CLOSE-UP: camera at her left side, lip height, 40 cm away…'}
      />
      {e.texto.trim() ? <p className={palabras > 260 ? 'lz-err' : 'vr-nota'}>{palabras} palabras. {palabras > 260 ? 'Es largo: con prompts largos Seedance tiende a volver al ángulo original (ideal: 120–200).' : 'Bien: corto funciona mejor.'}</p> : null}

      <button className={`btn-grad shine ${creando ? 'busy' : ''}`} style={{ width: '100%', marginTop: 6 }} disabled={!puede} onClick={crear}>
        {creando ? 'Creando… (puede tardar más de 10 minutos)' : e.resultado ? '🔄 Crear otra versión' : '🎥 Crear nuevos ángulos'}
      </button>
      {v && !mal ? <p className="vr-nota">Va a costar ≈ {fmt(estimado?.creditos ?? 0)} créditos ({usd(estimado?.creditos ?? 0)}){aprendido ? '' : ', estimado: Kie no publica este precio'}.</p> : null}

      {e.resultado ? (
        <div style={{ marginTop: 12 }}>
          <video className="vr-vid" src={e.resultado} controls playsInline preload="metadata" />
          <p className="vr-nota">✅ Listo{typeof e.cred === 'number' ? ` · costó ${fmt(e.cred)} créditos` : ''}. Ya está en tu galería.</p>
          <div className="vr-fila">
            <button className="btn-soft" onClick={() => onGuardar(e.resultado, 'video')} style={{ flex: 1 }}>⬇ Guardar</button>
            <button className="btn-grad" onClick={() => onPublicar(e.resultado, 'video')} style={{ flex: 1 }}>📤 Publicar</button>
          </div>
        </div>
      ) : null}
      {error ? <p className="errbox" style={{ marginTop: 10 }}>{error}</p> : null}
    </div>
  );
}
