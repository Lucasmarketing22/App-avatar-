'use client';

import { useEffect, useRef, useState } from 'react';

const USD_POR_CREDITO = 0.005;
const fmt = (n: number) => Math.round(n).toLocaleString('es-AR');
const usd = (n: number) => `US$ ${(n * USD_POR_CREDITO).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Estado = { id?: string; estado?: 'escuchando' | 'transcripto' | 'editando' | 'listo' | 'fallo'; resultado?: string; error?: string };

const PASOS: Record<string, string> = {
  subiendo: 'Preparando el audio…',
  escuchando: '👂 Escuchando lo que dice (puede tardar 1–2 minutos la primera vez)…',
  editando: '✍️ Escribiendo los subtítulos y armando el video (≈ 1 minuto)…',
};

/**
 * Edición automática: el mismo video con las pausas cortadas, acercamientos en
 * los cortes y subtítulos en español con la palabra clave en color. El
 * resultado es un video nuevo en la Galería (el original no se toca).
 */
export default function Editar(props: { url: string; onVideo: (url: string) => void; onGuardar: (url: string) => void; onClose: () => void }) {
  const { url, onVideo, onGuardar, onClose } = props;
  const [costo, setCosto] = useState<number | null>(null);
  const [paso, setPaso] = useState('');
  const [error, setError] = useState('');
  const [listo, setListo] = useState('');
  const vivo = useRef(true);

  useEffect(() => {
    vivo.current = true;
    fetch('/api/editar', { cache: 'no-store' }).then((r) => r.json()).then((j) => { if (vivo.current && typeof j.costo === 'number') setCosto(j.costo); }).catch(() => undefined);
    return () => { vivo.current = false; };
  }, []);

  async function consultar(id: string): Promise<Estado> {
    return fetch(`/api/editar?id=${encodeURIComponent(id)}`, { cache: 'no-store' }).then((r) => r.json()).catch(() => ({}));
  }

  async function editar() {
    const c = costo ?? 0;
    if (!window.confirm(`Editar automático: cortar pausas y poner subtítulos en español.\n\nCuesta ≈ ${fmt(c)} créditos (${usd(c)}). Es aproximado: al terminar se cobra lo real.\n\n¿Seguimos?`)) return;
    setError(''); setPaso('subiendo');
    try {
      const r = await fetch('/api/editar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
      const j = (await r.json().catch(() => ({}))) as Estado;
      if (!r.ok || !j.id) throw new Error(j.error ?? 'No se pudo empezar.');
      const id = j.id;
      setPaso('escuchando');
      // 1) Esperar la transcripción.
      let e: Estado = j;
      for (let i = 0; i < 100 && e.estado === 'escuchando'; i++) {
        await dormir(3000);
        if (!vivo.current) return;
        e = await consultar(id);
      }
      if (e.estado === 'fallo') throw new Error(e.error ?? 'No se pudo escuchar el video.');
      if (e.estado === 'escuchando') throw new Error('Tardó demasiado en escuchar el video. Probá de nuevo.');
      // 2) Armar el video. Si el celular corta la espera, se sigue consultando.
      setPaso('editando');
      e = await fetch('/api/editar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, accion: 'armar' }) })
        .then((x) => x.json()).catch(() => ({ estado: 'editando' }));
      for (let i = 0; i < 60 && (e.estado === 'editando' || e.estado === 'transcripto'); i++) {
        await dormir(5000);
        if (!vivo.current) return;
        e = await consultar(id);
      }
      if (e.estado !== 'listo' || !e.resultado) throw new Error(e.error ?? 'No se pudo armar el video. Probá de nuevo.');
      onVideo(e.resultado);
      setListo(e.resultado);
    } catch (x) {
      setError(x instanceof Error ? x.message : 'No se pudo editar el video.');
    } finally {
      setPaso('');
    }
  }

  return (
    <div className="ov pub-ov" onClick={paso ? undefined : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">✂️ Edición automática</span>
          <button className="modal-x" onClick={onClose} disabled={!!paso}>×</button>
        </div>
        <div className="modal-body">
          <div className="pub-media"><video src={listo || url} muted={!listo} playsInline controls preload="metadata" /></div>

          {listo ? (
            <>
              <p className="costo ok" style={{ marginTop: 10 }}>✅ Listo: es el video de arriba y ya está en tu Galería (se borra a los 2 días, descargalo).</p>
              <button className="btn-grad" style={{ width: '100%', marginTop: 8 }} onClick={() => onGuardar(listo)}>⬇ Guardar en el celular</button>
            </>
          ) : (
            <>
              <p className="sub" style={{ fontSize: 13, margin: '10px 0 0' }}>
                Corta las pausas, agrega acercamientos en los cortes y subtítulos en español (con la palabra clave en color). El original no se toca.
              </p>
              <button className="btn-grad shine" style={{ width: '100%', marginTop: 12 }} disabled={!!paso || costo === null} onClick={editar}>
                {paso ? 'Editando…' : costo === null ? 'Calculando…' : `✂️ Editar · ≈ ${fmt(costo)} créditos (${usd(costo)})`}
              </button>
              {paso ? <p className="sub" style={{ fontSize: 13, margin: '8px 0 0' }}>{PASOS[paso] ?? 'Trabajando…'}</p> : null}
              <p className="sub" style={{ fontSize: 12, margin: '8px 0 0' }}>No agrega música, B-roll ni efectos: eso sigue siendo a mano.</p>
            </>
          )}

          {error ? <p className="errbox" style={{ marginTop: 10 }}>{error}</p> : null}
        </div>
      </div>
    </div>
  );
}
