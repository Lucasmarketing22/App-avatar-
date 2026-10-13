'use client';

import { useEffect, useRef, useState } from 'react';

export type VideoSubido = { url: string; dur: number; mb: number; mudo?: boolean };
export type CuadroRecorte = { url: string; w: number; h: number } | null;

const fmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString('es-AR');
const MIN = 3;
const MAX = 30;

/** Tramos del video entre cortes de cámara (con un margen para no agarrar el corte). */
function tramos(dur: number, cortes: number[]): { desde: number; hasta: number }[] {
  const bordes = [0, ...cortes, dur];
  return bordes.slice(1).map((h, i) => ({ desde: i === 0 ? 0 : bordes[i] + 0.1, hasta: i === bordes.length - 2 ? h : h - 0.1 }));
}

/**
 * Revisión gratis del video subido (cortes de cámara, duración) + recorte.
 * El Motion Control cobra por segundo: recortando se paga solo lo que sirve.
 */
export default function RevisarVideo({ video, onRecortado, chico }: {
  video: VideoSubido;
  onRecortado: (v: VideoSubido, cuadro: CuadroRecorte) => void;
  chico?: boolean;
}) {
  const [rev, setRev] = useState<{ estado: 'revisando' | 'listo' | 'error'; dur: number; cortes: number[] }>({ estado: 'revisando', dur: 0, cortes: [] });
  const [abierto, setAbierto] = useState(false);
  const [desde, setDesde] = useState(0);
  const [hasta, setHasta] = useState(0);
  const [cortando, setCortando] = useState(false);
  const [error, setError] = useState('');
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    let vivo = true;
    setRev({ estado: 'revisando', dur: 0, cortes: [] }); setAbierto(false); setError('');
    fetch('/api/analizar-video', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: video.url }) })
      .then((r) => r.json())
      .then((d) => { if (vivo) setRev(Array.isArray(d.cortes) ? { estado: 'listo', dur: Number(d.dur) || 0, cortes: d.cortes } : { estado: 'error', dur: 0, cortes: [] }); })
      .catch(() => { if (vivo) setRev({ estado: 'error', dur: 0, cortes: [] }); });
    return () => { vivo = false; };
  }, [video.url]);

  const dur = rev.dur || video.dur || 0;
  const partes = rev.estado === 'listo' && dur ? tramos(dur, rev.cortes) : [];
  const mejor = partes.reduce<{ desde: number; hasta: number } | null>((a, b) => (!a || b.hasta - b.desde > a.hasta - a.desde ? b : a), null);
  const mejorDur = mejor ? Math.min(MAX, mejor.hasta - mejor.desde) : 0;

  function abrir(rango?: { desde: number; hasta: number }) {
    const d = rango?.desde ?? 0;
    const h = Math.min(rango?.hasta ?? dur, d + MAX, dur);
    setDesde(Math.round(d * 10) / 10); setHasta(Math.round(h * 10) / 10); setAbierto(true); setError('');
    if (ref.current) ref.current.currentTime = d;
  }
  function moverDesde(x: number) {
    const d = Math.min(x, Math.max(0, dur - MIN));
    setDesde(d);
    if (hasta - d < MIN) setHasta(Math.min(dur, d + MIN));
    if (hasta - d > MAX) setHasta(d + MAX);
    if (ref.current) ref.current.currentTime = d;
  }
  function moverHasta(x: number) {
    const h = Math.max(x, Math.min(dur, MIN));
    setHasta(h);
    if (h - desde < MIN) setDesde(Math.max(0, h - MIN));
    if (h - desde > MAX) setDesde(h - MAX);
    if (ref.current) ref.current.currentTime = Math.max(0, h - 1);
  }
  async function aplicar() {
    setCortando(true); setError('');
    try {
      const r = await fetch('/api/recortar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: video.url, desde, hasta }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.url) throw new Error(d.error ?? 'No se pudo recortar.');
      onRecortado({ url: d.url, dur: Number(d.dur) || hasta - desde, mb: Number(d.mb) || video.mb, mudo: video.mudo }, d.cuadro ? { url: d.cuadro, w: Number(d.w) || 0, h: Number(d.h) || 0 } : null);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo recortar.'); } finally { setCortando(false); }
  }

  const tramo = Math.max(0, hasta - desde);
  const ahorro = dur > 0 ? Math.round((1 - tramo / dur) * 100) : 0;
  const cortesDentro = rev.cortes.filter((c) => c > desde + 0.05 && c < hasta - 0.05);
  const pct = (t: number) => `${dur ? (t / dur) * 100 : 0}%`;

  return (
    <div className={`rv ${chico ? 'chico' : ''}`}>
      {rev.estado === 'revisando' ? <p className="rv-msg">🔍 Revisando el video (gratis)…</p> : null}
      {rev.estado === 'error' ? <p className="rv-msg">No pude revisar el video. Fijate que no tenga cortes de cámara.</p> : null}
      {rev.estado === 'listo' && !rev.cortes.length ? <p className="rv-msg ok">✅ Sin cortes de cámara: ideal para Motion Control.</p> : null}
      {rev.estado === 'listo' && rev.cortes.length ? (
        <div className="rv-msg mal">
          ⚠️ Tiene <b>{rev.cortes.length === 1 ? '1 corte' : `${rev.cortes.length} cortes`} de cámara</b> (en {rev.cortes.slice(0, 4).map((c) => `${fmt(c)} s`).join(', ')}{rev.cortes.length > 4 ? '…' : ''}).
          Los cortes confunden a la IA y es la causa más común de videos que salen mal.
          {mejor && mejorDur >= MIN
            ? <button className="btn-soft rv-btn" onClick={() => abrir(mejor)}>✂️ Usar el tramo más largo sin cortes ({fmt(mejorDur)} s)</button>
            : <> Ningún tramo sin cortes dura {MIN} segundos o más: mejor buscá otro video.</>}
        </div>
      ) : null}
      {rev.estado !== 'revisando' && dur > 15 && !abierto ? <p className="rv-msg">💡 Dura {fmt(dur)} s y el video se cobra <b>por segundo</b>. Si no necesitás todo, recortalo y pagás menos.</p> : null}

      {!abierto ? (
        dur >= MIN + 0.5 ? <button className="btn-ghost rv-btn" onClick={() => abrir()}>✂️ Recortar el video</button> : null
      ) : (
        <div className="rv-panel">
          <video
            ref={ref} className="rv-vid" src={video.url} muted playsInline preload="auto" controls
            onLoadedMetadata={(e) => { e.currentTarget.currentTime = desde; }}
            onTimeUpdate={(e) => { const v = e.currentTarget; if (v.currentTime >= hasta - 0.05) v.currentTime = desde; }}
          />
          <div className="rv-barra" aria-hidden>
            <span className="rv-sel" style={{ left: pct(desde), width: pct(tramo) }} />
            {rev.cortes.map((c) => <span key={c} className="rv-corte" style={{ left: pct(c) }} />)}
          </div>
          <label className="rv-lbl">Empieza en <b>{fmt(desde)} s</b></label>
          <input type="range" className="lz-slider" min={0} max={Math.max(0, dur - MIN)} step={0.1} value={desde} onChange={(e) => moverDesde(Number(e.target.value))} />
          <label className="rv-lbl">Termina en <b>{fmt(hasta)} s</b></label>
          <input type="range" className="lz-slider" min={Math.min(dur, MIN)} max={dur} step={0.1} value={hasta} onChange={(e) => moverHasta(Number(e.target.value))} />
          <p className="rv-msg">
            Te queda un video de <b>{fmt(tramo)} s</b>{ahorro > 0 ? <> · pagás <b>{ahorro}% menos</b> que con el video entero</> : null}.
            {cortesDentro.length ? <> ⚠️ Este tramo todavía tiene {cortesDentro.length === 1 ? 'un corte' : `${cortesDentro.length} cortes`} (la rayita roja).</> : null}
          </p>
          {error ? <p className="errbox" style={{ margin: '6px 0' }}>{error}</p> : null}
          <div className="rv-fila">
            <button className="btn-grad" disabled={cortando || tramo < MIN} onClick={aplicar}>{cortando ? 'Recortando…' : '✂️ Aplicar recorte'}</button>
            <button className="btn-soft" disabled={cortando} onClick={() => setAbierto(false)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
