'use client';

import { useEffect, useState } from 'react';

import { esperarTarea } from '@/lib/cliente/video';

const USD_POR_CREDITO = 0.005;
const fmt = (n: number) => Math.round(n).toLocaleString('es-AR');
const usd = (n: number) => `US$ ${(n * USD_POR_CREDITO).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type Opciones = { hd: number; final: number | null; borrador: boolean; vigente: boolean };

/** Duración del video (la mide el celular, sin descargarlo entero). */
function medirDuracion(url: string): Promise<number> {
  return new Promise((ok, mal) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    v.onloadedmetadata = () => (Number.isFinite(v.duration) && v.duration > 0 ? ok(v.duration) : mal(new Error('sin duración')));
    v.onerror = () => mal(new Error('no carga'));
    v.src = url;
  });
}

/**
 * Mejorar la calidad de un video ya hecho:
 *  - "Mejorar a HD" con Topaz x2 (cualquier video; un 480p queda en 960×1708).
 *  - "Pasar a 1080p" con Seedance (solo borradores de Escenas de hasta 7 días).
 * El resultado aparece como un video nuevo en la Galería.
 */
export default function Mejorar(props: { url: string; mult: number; onVideo: (url: string) => void; onClose: () => void }) {
  const { url, mult, onVideo, onClose } = props;
  const [dur, setDur] = useState(0);
  const [op, setOp] = useState<Opciones | null>(null);
  const [error, setError] = useState('');
  const [trabajando, setTrabajando] = useState<'' | 'hd' | '1080'>('');
  const [listo, setListo] = useState('');

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        // Si el celular no puede leer la duración, la mide el servidor.
        const d = await medirDuracion(url).catch(() => 0);
        if (!vivo) return;
        setDur(d);
        const r = await fetch(`/api/mejorar-video?url=${encodeURIComponent(url)}${d ? `&dur=${d}` : ''}`, { cache: 'no-store' });
        const j = await r.json().catch(() => ({}));
        if (!vivo) return;
        if (!r.ok) throw new Error(j.error ?? 'No se pudieron calcular los precios.');
        setOp(j as Opciones);
      } catch (e) {
        if (vivo) setError(e instanceof Error ? e.message : 'No se pudo leer el video. Probá de nuevo.');
      }
    })();
    return () => { vivo = false; };
  }, [url]);

  async function mejorar(modo: 'hd' | '1080') {
    if (!op) return;
    const cred = (modo === 'hd' ? op.hd : op.final ?? 0) * mult;
    const que = modo === 'hd' ? 'Mejorar a HD con Topaz (x2)' : 'Pasar a 1080p con Seedance (la misma escena, generada de nuevo)';
    if (!window.confirm(`${que}.\n\nVa a costar ≈ ${fmt(cred)} créditos (${usd(cred)}).${modo === '1080' ? ' Kie no publica este precio: es una estimación, al terminar se cobra lo real.' : ''}\n\n¿Seguimos?`)) return;
    setError(''); setTrabajando(modo);
    try {
      const r = await fetch('/api/mejorar-video', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, dur, modo }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.taskId) throw new Error(j.error ?? 'No se pudo empezar.');
      const res = await esperarTarea(j.taskId as string);
      onVideo(res.url);
      setListo(res.url);
      if (res.aviso) setError(res.aviso);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo mejorar el video.');
    } finally {
      setTrabajando('');
    }
  }

  return (
    <div className="ov pub-ov" onClick={trabajando ? undefined : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">✨ Mejorar calidad</span>
          <button className="modal-x" onClick={onClose} disabled={!!trabajando}>×</button>
        </div>
        <div className="modal-body">
          <div className="pub-media"><video src={listo || url} muted playsInline controls preload="metadata" /></div>

          {listo ? (
            <p className="costo ok" style={{ marginTop: 10 }}>✅ Listo: es el video de arriba y ya está en tu Galería (se borra a los 2 días, descargalo).</p>
          ) : !op && !error ? (
            <p className="sub" style={{ marginTop: 10 }}>Calculando precios…</p>
          ) : op ? (
            <>
              <button className="btn-grad shine" style={{ width: '100%', marginTop: 12 }} disabled={!!trabajando} onClick={() => mejorar('hd')}>
                {trabajando === 'hd' ? 'Mejorando… (puede tardar varios minutos)' : `🔍 Mejorar a HD · ≈ ${fmt(op.hd * mult)} créditos (${usd(op.hd * mult)})`}
              </button>
              <p className="sub" style={{ fontSize: 12, margin: '6px 0 0' }}>Topaz x2: el mismo video, con más nitidez en caras, pelo y ropa (un 480p queda en 960×1708). El detalle lo reconstruye la IA: no es igual a un video generado en 1080p.</p>

              {op.vigente && op.final !== null ? (
                <>
                  <button className="btn-soft" style={{ width: '100%', marginTop: 12, height: 44, fontSize: 14 }} disabled={!!trabajando} onClick={() => mejorar('1080')}>
                    {trabajando === '1080' ? 'Generando en 1080p… (puede tardar más de 10 minutos)' : `✨ Pasar a 1080p · ≈ ${fmt(op.final * mult)} créditos (${usd(op.final * mult)})`}
                  </button>
                  <p className="sub" style={{ fontSize: 12, margin: '6px 0 0' }}>Seedance genera la misma escena de nuevo en 1080p. Es la mejor calidad, pero algún detalle puede salir distinto al borrador.</p>
                </>
              ) : (
                <p className="sub" style={{ fontSize: 12, margin: '12px 0 0' }}>
                  {op.borrador ? '⏳ Pasar a 1080p ya no se puede: pasaron más de 7 días desde el borrador.' : 'ℹ️ Pasar a 1080p solo se puede con los borradores de Escenas (hasta 7 días).'}
                </p>
              )}
            </>
          ) : null}

          {error ? <p className="errbox" style={{ marginTop: 10 }}>{error}</p> : null}
        </div>
      </div>
    </div>
  );
}
