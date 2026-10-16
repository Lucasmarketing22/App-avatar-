'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';

/** Estimación del costo de un video: por segundo (si ya se conoce) o el último video con ese motor. */
export type Estimado = { creditos: number; porSegundo: boolean } | null;

const fmt = (n: number) => Math.round(n).toLocaleString('es-AR');
const usd = (n: number) => `US$ ${(n * 0.005).toFixed(2).replace('.', ',')}`;

/**
 * "Revisá antes de crear": antes de gastar en un video (Motion, Viral, Hablados) muestra la
 * foto de inicio al lado del primer cuadro del video, lo que va a costar y el
 * saldo, y pide confirmar lo que más arruina un video. No gasta nada.
 */
export default function ConfirmarVideo(p: {
  foto: string;
  cuadro?: string;
  /** Video de referencia (Motion/Viral). Sin video ni cuadro se muestra solo la foto. */
  videoUrl?: string;
  dur: number;
  motor: string;
  estimado: Estimado;
  extra?: number;
  saldo: number | null;
  nombre: string;
  notaFoto?: string;
  /** Lo que hay que confirmar (si no se pasa, los 3 chequeos de Motion). */
  items?: string[];
  /** Texto de la segunda caja (Hablados: el guion). */
  guion?: string;
  onCrear: () => void;
  onCerrar: () => void;
}) {
  const items = p.items ?? [
    `La foto y el video arrancan en la misma pose y con el mismo encuadre`,
    `En el video hay una sola persona, bien visible y sin cortes de cámara`,
    `La cara de ${p.nombre} se ve bien en la foto`,
  ];
  const [ok, setOk] = useState(() => items.map(() => false));
  const total = p.estimado ? p.estimado.creditos + (p.extra ?? 0) : null;
  const noAlcanza = total !== null && p.saldo !== null && total > p.saldo;
  const todo = ok.every(Boolean);
  // Se dibuja directo en la página (fuera del Lienzo, que se queda con los toques para moverse).
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      className="cv-ov" data-ui onClick={p.onCerrar}
      // Los eventos de un portal igual suben por React: que no lleguen al Lienzo.
      onPointerDown={(e) => e.stopPropagation()} onPointerMove={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <div className="cv" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Revisá antes de crear">
        <div className="cv-tit">✅ Revisá antes de crear</div>
        <p className="cv-sub">El video se cobra igual aunque salga mal: un minuto de revisión te ahorra plata.</p>

        <div className="cv-par">
          <div>
            <span className="cv-th">{p.foto ? <Image src={p.foto} alt="Foto de inicio" fill sizes="160px" /> : null}</span>
            <small>Foto de inicio</small>
          </div>
          {p.guion !== undefined ? (
            <div>
              <span className="cv-th cv-guion">“{p.guion}”</span>
              <small>Lo que va a decir</small>
            </div>
          ) : p.cuadro || p.videoUrl ? (
            <div>
              <span className="cv-th">
                {p.cuadro
                  ? <Image src={p.cuadro} alt="Primer cuadro del video" fill sizes="160px" />
                  : <video src={`${p.videoUrl}#t=0.1`} muted playsInline preload="metadata" />}
              </span>
              <small>Primer cuadro del video</small>
            </div>
          ) : null}
        </div>
        {p.notaFoto ? <p className="cv-nota">{p.notaFoto}</p> : null}

        <div className="cv-costo">
          <div><span>Video</span><b>{Math.round(p.dur * 10) / 10 || '?'} s · {p.motor}</b></div>
          <div>
            <span>Va a costar</span>
            <b>{total === null ? 'lo vas a ver después del primero' : `≈ ${fmt(total)} créditos (≈ ${usd(total)})`}</b>
          </div>
          {p.estimado && !p.estimado.porSegundo ? <small>Según tu último video con este motor (se cobra por segundo).</small> : null}
          {p.extra ? <small>Incluye la foto de inicio que se prepara antes.</small> : null}
          <div><span>Tu saldo</span><b>{p.saldo === null ? '—' : `${fmt(p.saldo)} créditos (≈ ${usd(p.saldo)})`}</b></div>
        </div>
        {noAlcanza ? <p className="errbox" style={{ margin: '8px 0 0' }}>No te alcanza el saldo para este video. Cargá saldo o hacé el video más corto.</p> : null}

        <div className="cv-checks">
          {items.map((t, i) => (
            <label key={t} className="cv-ck">
              <input type="checkbox" checked={ok[i]} onChange={(e) => setOk((x) => x.map((v, j) => (j === i ? e.target.checked : v)))} />
              <span>{t}</span>
            </label>
          ))}
        </div>

        <button className="btn-grad shine cv-crear" disabled={!todo || noAlcanza} onClick={() => { p.onCerrar(); p.onCrear(); }}>
          🎬 Crear video{total !== null ? ` · ≈ ${usd(total)}` : ''}
        </button>
        {!todo && !noAlcanza ? <p className="cv-nota" style={{ textAlign: 'center' }}>Tildá {items.length === 1 ? 'la casilla' : `las ${items.length}`} para habilitar el botón.</p> : null}
        <button className="btn-soft cv-volver" onClick={p.onCerrar}>Volver y corregir</button>
      </div>
    </div>,
    document.body,
  );
}
