'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';

import { esperarTarea, subirImagen } from '@/lib/cliente/video';
import Angulos from '@/components/Angulos';
import ConfirmarVideo, { type Estimado } from '@/components/ConfirmarVideo';

type Props = {
  estimar: (clave: string, dur: number) => Estimado;
  saldo: number | null;
  onVideo: (url: string) => void;
  onTrabajo: (msg: string) => void;
  onPublicar: (url: string, tipo: 'foto' | 'video') => void;
  onGuardar: (url: string, tipo: 'foto' | 'video') => void;
  onSaldo: () => void;
  onVolver?: () => void;
  /** Precio de la cuenta: créditos de Kie × esto (1 para el administrador). */
  mult?: number;
  /** Videos recientes de la galería (para Nuevos ángulos). */
  galeria?: string[];
};

type Rol = 'a' | 'b' | 'c' | 'lugar' | 'ropa' | 'objeto';
type Calidad = 'borrador' | '720p' | '1080p';
const ROLES: { id: Rol; label: string }[] = [
  { id: 'a', label: 'Persona A' }, { id: 'b', label: 'Persona B' }, { id: 'c', label: 'Persona C' },
  { id: 'lugar', label: 'Lugar' }, { id: 'ropa', label: 'Ropa' }, { id: 'objeto', label: 'Objeto' },
];
const PERSONAS: Rol[] = ['a', 'b', 'c'];

/** Todo lo que hay que recordar (se guarda en el celu por si se cierra la app). */
type Estado = {
  refs: { url: string; rol: Rol }[];
  texto: string;
  dur: number;
  formato: '9:16' | '16:9';
  calidad: Calidad;
  videoTask: string;
  /** Si lo que se está creando es el paso del borrador a 1080p. */
  videoEsFinal: boolean;
  resultado: string;
  resultadoCalidad: Calidad;
  videoCred?: number;
  /** Último borrador terminado: se puede pasar a 1080p durante 7 días. */
  borrador: { id: string; dur: number; ts: number } | null;
};
const VACIO: Estado = {
  refs: [], texto: '', dur: 15, formato: '9:16', calidad: 'borrador', videoTask: '', videoEsFinal: false, resultado: '', resultadoCalidad: 'borrador', borrador: null,
};
const CLAVE = 'musa-escenas-v1';
const DURS = [8, 10, 15, 20, 30];
const SIETE_DIAS = 7 * 24 * 60 * 60 * 1000;
const fmt = (n: number) => Math.round(n).toLocaleString('es-AR');
const usd = (n: number) => `≈ US$ ${(n * 0.005).toFixed(2).replace('.', ',')}`;
const contar = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;
/** Lo que se dice: el texto entre comillas ("…" o “…”). Sin comillas, no se puede separar de las indicaciones. */
const hablado = (t: string): string | null => {
  const frases = t.match(/"[^"\n]+"|“[^”\n]+”/g);
  return frases ? frases.join(' ').replace(/["“”]/g, '') : null;
};
/**
 * Precios publicados por Kie para Seedance 2.5 sin video de entrada, por
 * segundo (kie.ai/seedance-2-5, revisados el 20/10/2026). El paso del borrador
 * a 1080p no tiene precio publicado: se estima como un 1080p entero.
 */
const SEG: Record<string, number> = { '480p': 28, '720p': 63, '1080p': 158 };
/** 720p en Replicate: US$ 0,2312 por segundo = 46,24 créditos (replicate.com, revisado el 23/10/2026). */
const SEG_REPLICATE_720 = 0.2312 / 0.005;
const resolucion = (c: Calidad) => (c === 'borrador' ? '480p' : c);
/** Lo que cabe hablar en esos segundos, sin apuro (unas 2,3 palabras por segundo entre las dos). */
const palabrasMax = (dur: number) => Math.round(dur * 2.3);

/** Si la espera se corta (video largo), se vuelve a esperar: la tarea sigue en la IA. */
async function esperarLargo(taskId: string, sigue: () => boolean) {
  for (let i = 0; ; i++) {
    try { return await esperarTarea(taskId, sigue); } catch (er) {
      if (i < 2 && er instanceof Error && er.message.startsWith('Tardó demasiado')) continue;
      throw er;
    }
  }
}

export default function Escenas(props: Props) {
  const { estimar, saldo, onVideo, onTrabajo, onPublicar, onGuardar, onSaldo, onVolver, mult = 1, galeria = [] } = props;
  const [e, setE] = useState<Estado>(VACIO);
  const eRef = useRef(e); eRef.current = e;
  const set = (p: Partial<Estado>) => setE((x) => ({ ...x, ...p }));
  const [error, setError] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const [creando, setCreando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const vivo = useRef(true);

  /* ----- recordar el progreso en el celu ----- */
  const [listo, setListo] = useState(false);
  // ¿Está configurado Replicate? (entonces 720p se hace ahí, más barato).
  const [replicate, setReplicate] = useState(false);
  useEffect(() => { fetch('/api/escena', { cache: 'no-store' }).then((r) => r.json()).then((j) => setReplicate(!!j.replicate)).catch(() => undefined); }, []);
  useEffect(() => {
    vivo.current = true;
    try { const s = localStorage.getItem(CLAVE); if (s) setE({ ...VACIO, ...(JSON.parse(s) as Estado) }); } catch { /* */ }
    setListo(true);
    return () => { vivo.current = false; };
  }, []);
  useEffect(() => { if (!listo) return; try { localStorage.setItem(CLAVE, JSON.stringify(e)); } catch { /* */ } }, [e, listo]);
  // Si quedó algo creándose (se cerró la app), lo seguimos esperando.
  useEffect(() => {
    if (!listo) return;
    const x = eRef.current;
    if (x.videoTask) terminarVideo(x.videoTask, x.videoEsFinal ? '1080p' : x.calidad, x.dur, x.videoEsFinal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listo]);
  useEffect(() => { onTrabajo(creando ? '🎬 Escena: creando el video… (puede tardar bastante)' : ''); }, [creando, onTrabajo]);

  /* ----- 1. Fotos de referencia ----- */
  async function subirFotos(ev: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(ev.target.files ?? []); ev.target.value = '';
    if (!files.length) return;
    const lugar = 9 - e.refs.length;
    if (lugar <= 0) { setError('Ya hay 9 fotos: borrá alguna para sumar otra.'); return; }
    setError(''); setSubiendo(true);
    try {
      for (const f of files.slice(0, lugar)) {
        const url = await subirImagen(f);
        setE((x) => {
          // La primera foto de cada persona que falta toma ese lugar; el resto queda como "Lugar" (se cambia con un toque).
          const libre = PERSONAS.find((p) => !x.refs.some((r) => r.rol === p));
          return { ...x, refs: [...x.refs, { url, rol: x.refs.length < 2 && libre ? libre : 'lugar' }] };
        });
      }
      if (files.length > lugar) setError(`Entraron ${lugar} fotos: el máximo es 9.`);
    } catch (er) {
      setError(er instanceof Error && er.message ? er.message : 'No se pudo subir la foto.');
    } finally { setSubiendo(false); }
  }
  const cambiarRol = (i: number, rol: Rol) => set({ refs: e.refs.map((r, k) => (k === i ? { ...r, rol } : r)) });
  const quitar = (i: number) => set({ refs: e.refs.filter((_, k) => k !== i) });

  /* ----- 3. Video ----- */
  const claveVideo = `bytedance/seedance-2-5|${resolucion(e.calidad)}`;
  // 720p se hace en Replicate cuando está configurado (más barato que Kie).
  const porReplicate = e.calidad === '720p' && replicate;
  const estimado: Estimado = porReplicate
    ? { creditos: SEG_REPLICATE_720 * e.dur * mult, porSegundo: true }
    : estimar(claveVideo, e.dur) ?? { creditos: SEG[resolucion(e.calidad)] * e.dur * mult, porSegundo: true };
  const borradorVigente = e.borrador && Date.now() - e.borrador.ts < SIETE_DIAS ? e.borrador : null;
  const estimadoFinal = borradorVigente
    ? (estimar('bytedance/seedance-2-5-draft|1080p', borradorVigente.dur) ?? { creditos: SEG['1080p'] * borradorVigente.dur * mult, porSegundo: true })
    : null;
  const personas = e.refs.filter((r) => PERSONAS.includes(r.rol));
  const dicho = hablado(e.texto);
  const palabras = contar(dicho ?? e.texto);
  const max = palabrasMax(e.dur);
  // Sin personas también se puede: tomas de lugares u objetos (recorrido de una casa, B-roll de producto).
  const puede = e.refs.length > 0 && !!e.texto.trim() && !creando;

  async function crearVideo() {
    if (!puede) return;
    setError(''); setCreando(true);
    const x = eRef.current;
    try {
      const res = await fetch('/api/escena', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refs: x.refs, texto: x.texto, dur: x.dur, calidad: x.calidad, formato: x.formato }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.taskId) throw new Error(d.error ?? 'No se pudo crear el video.');
      if (d.aviso) setError(d.aviso);
      set({ videoTask: d.taskId, videoEsFinal: false });
      await terminarVideo(d.taskId, x.calidad, x.dur, false);
    } catch (er) {
      if (vivo.current) { setError(er instanceof Error ? er.message : 'No se pudo crear el video.'); set({ videoTask: '' }); setCreando(false); }
    }
  }
  async function pasarA1080() {
    const b = borradorVigente;
    if (!b || creando || !estimadoFinal) return;
    if (!window.confirm(`Pasar el borrador a 1080p, con la misma escena.\n\nVa a costar ≈ ${fmt(estimadoFinal.creditos)} créditos (${usd(estimadoFinal.creditos)}). Kie no publica este precio: es una estimación, al terminar se cobra lo real.\n\n¿Seguimos?`)) return;
    setError(''); setCreando(true);
    try {
      const res = await fetch('/api/escena', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'final', borrador: b.id, dur: b.dur }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.taskId) throw new Error(d.error ?? 'No se pudo pasar a 1080p.');
      set({ videoTask: d.taskId, videoEsFinal: true });
      await terminarVideo(d.taskId, '1080p', b.dur, true);
    } catch (er) {
      if (vivo.current) { setError(er instanceof Error ? er.message : 'No se pudo pasar a 1080p.'); set({ videoTask: '' }); setCreando(false); }
    }
  }
  async function terminarVideo(taskId: string, calidad: Calidad, dur: number, final: boolean) {
    setCreando(true);
    try {
      const r = await esperarLargo(taskId, () => vivo.current);
      if (r.aviso) setError(r.aviso);
      set({
        videoTask: '', videoEsFinal: false, resultado: r.url, resultadoCalidad: calidad, videoCred: r.credits,
        // Solo los borradores de Kie se pueden pasar a 1080p (los de Replicate empiezan con rep_).
        ...(calidad === 'borrador' && !final && !taskId.startsWith('rep_') ? { borrador: { id: taskId, dur, ts: Date.now() } } : {}),
      });
      onVideo(r.url); onSaldo();
    } catch (er) {
      if (vivo.current && !(er instanceof Error && er.message === 'cancelado')) { setError(er instanceof Error ? er.message : 'Error.'); set({ videoTask: '' }); }
    } finally { if (vivo.current) setCreando(false); }
  }

  function empezarOtra() {
    if (creando && !window.confirm('Hay un video creándose. ¿Empezar otra escena igual? (lo que termine va a aparecer en tu galería)')) return;
    setE((x) => ({ ...VACIO, dur: x.dur, formato: x.formato, calidad: 'borrador' }));
    setError('');
  }

  const n = (k: number) => <span className="vr-n">{k}</span>;
  const rolLabel = (r: Rol) => ROLES.find((x) => x.id === r)?.label ?? r;

  /* ===================== Render ===================== */
  return (
    <div className="vr">
      {onVolver ? <button className="btn-ghost" onClick={onVolver} style={{ padding: '6px 12px', fontSize: 13, marginBottom: 8 }}>← Volver a Hablados</button> : null}
      <p className="sub" style={{ marginTop: 0 }}>Un video de hasta <b>30 s seguidos</b> con varias personas que hablan entre sí, se mueven y tocan cosas, con voces y sonido. Lo hace <b>Seedance 2.5</b> a partir de tus fotos de referencia y de la escena que escribas.</p>

      {/* 1. Referencias */}
      <div className="panel vr-paso hb-paso">
        <div className="vr-tit">{n(1)} 🖼️ Fotos de referencia</div>
        <p className="vr-nota" style={{ marginTop: 0 }}>Subí las fotos de cada persona (cara y cuerpo entero, con la ropa que van a tener) y, si querés, la del lugar o de un objeto. Hasta 9. Debajo de cada una elegí <b>qué es</b>: así la IA sabe quién es quién.</p>
        <div className="vr-fotos" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          {e.refs.length < 9 ? (
            <label className="lz-th vr-subir" style={{ width: '100%', height: 'auto', aspectRatio: '3 / 4' }}>
              <input type="file" accept="image/*" multiple onChange={subirFotos} style={{ display: 'none' }} disabled={subiendo} />
              <span>{subiendo ? '…' : '＋'}</span><small>{subiendo ? 'Subiendo' : 'Subir fotos'}</small>
            </label>
          ) : null}
          {e.refs.map((r, i) => (
            <div key={r.url} style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
              <span className="lz-th" style={{ width: '100%', height: 'auto', aspectRatio: '3 / 4', position: 'relative' }}>
                <Image src={r.url} alt="" fill sizes="96px" />
                <button aria-label="Quitar foto" className="vr-quitar" onClick={() => quitar(i)} style={{ width: 26, height: 26, lineHeight: '26px', border: 'none', padding: 0, cursor: 'pointer' }}>✕</button>
              </span>
              <select className="input" value={r.rol} onChange={(ev) => cambiarRol(i, ev.target.value as Rol)} aria-label="Qué es esta foto" style={{ width: '100%', minWidth: 0, padding: '4px 6px', fontSize: 12 }}>
                {ROLES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
              </select>
            </div>
          ))}
        </div>
        {e.refs.length ? (
          <p className="vr-nota">{PERSONAS.filter((p) => e.refs.some((r) => r.rol === p)).map((p) => `${rolLabel(p)}: ${e.refs.filter((r) => r.rol === p).length} foto${e.refs.filter((r) => r.rol === p).length > 1 ? 's' : ''}`).join(' · ') || 'Sin personas: sirve para tomas de lugares u objetos (por ejemplo, el recorrido de una casa).'}</p>
        ) : null}
      </div>

      {/* 2. Escena y diálogos */}
      <div className="panel vr-paso hb-paso">
        <div className="vr-tit">{n(2)} ✍️ La escena y los diálogos</div>
        <p className="vr-nota" style={{ marginTop: 0 }}>Escribí qué pasa, en orden: cómo se filma (ej. celular en mano), dónde están, qué hacen y <b>quién dice qué</b>, usando <b>Person A</b> / <b>Person B</b>. Mejor en inglés (la IA lo entiende mejor), con los diálogos en el idioma en que quieras que hablen.</p>
        <textarea
          className="textarea" value={e.texto} onChange={(ev) => set({ texto: ev.target.value })} style={{ height: 220 }}
          placeholder={'Ej: Handheld smartphone video in a cozy bedroom, one continuous shot. Person A holds the phone and films Person B.\nPerson A (excited, to camera): "Look at her skin."\nPerson B (laughs, touches her hair): "Every single strand."\n…'}
        />
        {e.texto.trim() ? (
          dicho !== null ? (
            <p className={palabras > max ? 'lz-err' : 'vr-nota'}>🗣️ {palabras} palabras habladas (lo que está entre comillas). {palabras > max ? `Para ${e.dur} s conviene hasta unas ${max}: si no, van a hablar apuradas o se cortan.` : `Entra bien en ${e.dur} s.`}</p>
          ) : (
            <p className="vr-nota">Poné lo que dicen <b>entre comillas</b> (ej. Person A: {'"Hi!"'}) así la IA sabe qué es diálogo y la app cuenta si entra en {e.dur} s.</p>
          )
        ) : null}
      </div>

      {/* 3. Video */}
      <div className="panel vr-paso hb-paso">
        <div className="vr-tit">{n(3)} 🎬 Video</div>
        <div className="vr-tit chico">⏱️ Duración</div>
        <div className="lz-chips">
          {DURS.map((d) => <button key={d} className={`opt ${e.dur === d ? 'on' : ''}`} onClick={() => set({ dur: d })}>{d} s</button>)}
        </div>
        <div className="vr-tit chico">📐 Formato</div>
        <div className="lz-chips">
          <button className={`opt ${e.formato === '9:16' ? 'on' : ''}`} onClick={() => set({ formato: '9:16' })}>📱 Vertical 9:16</button>
          <button className={`opt ${e.formato === '16:9' ? 'on' : ''}`} onClick={() => set({ formato: '16:9' })}>🖥️ Horizontal 16:9</button>
        </div>
        <div className="vr-tit chico">✨ Calidad</div>
        <div className="lz-chips">
          <button className={`opt ${e.calidad === 'borrador' ? 'on' : ''}`} onClick={() => set({ calidad: 'borrador' })}>🧪 Borrador 480p ⭐</button>
          <button className={`opt ${e.calidad === '720p' ? 'on' : ''}`} onClick={() => set({ calidad: '720p' })}>720p</button>
          <button className={`opt ${e.calidad === '1080p' ? 'on' : ''}`} onClick={() => set({ calidad: '1080p' })}>1080p</button>
        </div>
        <p className="vr-nota">{e.calidad === 'borrador'
          ? 'Primero probá en borrador (barato). Si te gusta, lo pasás a 1080p con la misma escena: así la calidad final se paga una sola vez.'
          : 'Directo en esta calidad: si algo sale mal, se cobra igual. Conviene probar antes en borrador.'}</p>
        {!e.refs.length ? <p className="vr-nota">👆 Falta al menos una foto de referencia (paso 1).</p> : null}
        {e.refs.length && !e.texto.trim() ? <p className="vr-nota">👆 Falta escribir la escena (paso 2).</p> : null}
        <button className={`btn-grad shine ${creando ? 'busy' : ''}`} style={{ width: '100%', marginTop: 6 }} disabled={!puede} onClick={() => setConfirmar(true)}>
          {creando ? 'Creando… (puede tardar más de 10 minutos)' : e.resultado ? '🔄 Crear otra versión' : e.calidad === 'borrador' ? '🧪 Crear borrador' : '🎬 Crear video'}
        </button>
        <p className="vr-nota">Va a costar ≈ {fmt(estimado?.creditos ?? 0)} créditos ({usd(estimado?.creditos ?? 0)}){porReplicate ? ', en Replicate (más barato que Kie)' : estimar(claveVideo, e.dur) ? '' : ', según el precio de lista de Kie'}.</p>
        {e.resultado ? (
          <div style={{ marginTop: 12 }}>
            <video className="vr-vid" src={e.resultado} controls playsInline preload="metadata" />
            <p className="vr-nota">✅ Listo{e.resultadoCalidad === 'borrador' ? ' (borrador 480p)' : ` (${e.resultadoCalidad})`}{typeof e.videoCred === 'number' ? ` · costó ${fmt(e.videoCred)} créditos` : ''}. Ya está en tu galería.</p>
            {e.resultadoCalidad === 'borrador' && borradorVigente && estimadoFinal ? (
              <>
                <button className="btn-grad" style={{ width: '100%', marginTop: 6 }} disabled={creando} onClick={pasarA1080}>✨ Me gusta: pasarlo a 1080p</button>
                <p className="vr-nota">Misma escena en alta calidad. ≈ {fmt(estimadoFinal.creditos)} créditos ({usd(estimadoFinal.creditos)}), estimado. Se puede hasta 7 días después del borrador.</p>
              </>
            ) : null}
            <div className="vr-fila">
              <button className="btn-soft" onClick={() => onGuardar(e.resultado, 'video')} style={{ flex: 1 }}>⬇ Guardar</button>
              <button className="btn-grad" onClick={() => onPublicar(e.resultado, 'video')} style={{ flex: 1 }}>📤 Publicar</button>
            </div>
            <p className="vr-nota">🏷️ Al publicar, marcalo como contenido hecho con IA (TikTok e Instagram lo piden).</p>
          </div>
        ) : null}
      </div>

      {error ? <p className="errbox" style={{ margin: '12px 0' }}>{error}</p> : null}
      <Angulos propio={e.resultado || undefined} galeria={galeria} estimar={estimar} mult={mult} onVideo={onVideo} onSaldo={onSaldo} onGuardar={onGuardar} onPublicar={onPublicar} />
      <button className="btn-ghost" style={{ width: '100%', marginTop: 12 }} onClick={empezarOtra}>🔁 Empezar otra escena</button>
      {confirmar && e.refs[0] ? (
        <ConfirmarVideo
          foto={(personas[0] ?? e.refs[0]).url}
          guion={e.texto}
          dur={e.dur}
          motor={`Seedance 2.5 · ${e.calidad === 'borrador' ? 'borrador 480p' : e.calidad}`}
          estimado={estimado}
          saldo={saldo}
          nombre="la escena"
          items={[
            'Cada foto está marcada con lo que es (Persona A, Persona B, Lugar…)',
            `Los diálogos entran en ${e.dur} s sin que hablen apuradas`,
            e.calidad === 'borrador' ? 'Sé que es una prueba en baja calidad' : 'Sé que si sale mal se cobra igual (conviene probar en borrador)',
          ]}
          onCrear={crearVideo}
          onCerrar={() => setConfirmar(false)}
        />
      ) : null}
    </div>
  );
}
