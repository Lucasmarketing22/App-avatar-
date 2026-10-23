'use client';

import { useEffect, useRef, useState } from 'react';

import { subirImagen } from '@/lib/cliente/video';
import { OPCIONES_BASE, type OpcionesEdicion } from '@/lib/edicion/opciones';

const USD_POR_CREDITO = 0.005;
const fmt = (n: number) => Math.round(n).toLocaleString('es-AR');
const usd = (n: number) => `US$ ${(n * USD_POR_CREDITO).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Lo último que eligió (estilo, capas, marca, foto del producto…), para no cargarlo cada vez. */
const CLAVE = 'musa_edicion';

/** Capas del estilo Pro que se pueden prender o apagar. */
const CAPAS: { id: 'emojis' | 'sonidos' | 'movimiento' | 'color' | 'cierre'; label: string }[] = [
  { id: 'emojis', label: '😀 Emojis' },
  { id: 'sonidos', label: '🔊 Sonidos' },
  { id: 'movimiento', label: '🎥 Zoom y transiciones' },
  { id: 'color', label: '🎨 Color' },
  { id: 'cierre', label: '🎬 Cierre con producto' },
];

type Estado = { id?: string; estado?: 'escuchando' | 'transcripto' | 'editando' | 'listo' | 'fallo'; resultado?: string; error?: string };

const PASOS: Record<string, string> = {
  subiendo: 'Preparando el audio…',
  escuchando: '👂 Escuchando lo que dice (puede tardar 1–2 minutos la primera vez)…',
  editando: '✍️ Escribiendo los subtítulos y armando el video (≈ 1 minuto)…',
};

/**
 * Edición automática con dos estilos:
 *  - Natural: pausas cortadas, acercamientos en los cortes y subtítulos sutiles.
 *  - Pro: además captions con rebote y emoji, zoom, transiciones, sonidos, color
 *    y cierre con el producto (cada capa se puede apagar).
 * El resultado es un video nuevo en la Galería (el original no se toca).
 */
export default function Editar(props: { url: string; onVideo: (url: string) => void; onGuardar: (url: string) => void; onClose: () => void }) {
  const { url, onVideo, onGuardar, onClose } = props;
  const [costo, setCosto] = useState<number | null>(null);
  const [paso, setPaso] = useState('');
  const [error, setError] = useState('');
  const [listo, setListo] = useState('');
  const [op, setOp] = useState<OpcionesEdicion>(OPCIONES_BASE);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const vivo = useRef(true);
  useEffect(() => {
    try { const g = JSON.parse(localStorage.getItem(CLAVE) ?? 'null'); if (g && typeof g === 'object') setOp({ ...OPCIONES_BASE, ...g }); } catch { /* */ }
  }, []);
  const cambiar = (x: Partial<OpcionesEdicion>) => setOp((o) => {
    const n = { ...o, ...x };
    try { localStorage.setItem(CLAVE, JSON.stringify(n)); } catch { /* */ }
    return n;
  });
  async function subirFoto(f: File | undefined) {
    if (!f) return;
    setError(''); setSubiendoFoto(true);
    try { cambiar({ foto: await subirImagen(f), cierre: true }); } catch (x) { setError(x instanceof Error ? x.message : 'No se pudo subir la foto.'); } finally { setSubiendoFoto(false); }
  }
  const pro = op.estilo === 'pro';
  const faltaFoto = pro && op.cierre && !op.foto;

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
    if (faltaFoto) { setError('Subí la foto del producto para el cierre, o apagá "🎬 Cierre con producto".'); return; }
    if (!window.confirm(`Edición ${pro ? 'Pro' : 'natural'}: cortar pausas y poner subtítulos en español${pro ? ' con efectos' : ''}.\n\nCuesta ≈ ${fmt(c)} créditos (${usd(c)}). Es aproximado: al terminar se cobra lo real.\n\n¿Seguimos?`)) return;
    setError(''); setPaso('subiendo');
    try {
      const r = await fetch('/api/editar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, opciones: pro ? op : { estilo: 'natural' } }) });
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
              <div className="vr-tit chico" style={{ marginTop: 12 }}>¿Qué tipo de edición?</div>
              <div className="lz-chips">
                <button className={`opt ${!pro ? 'on' : ''}`} disabled={!!paso} onClick={() => cambiar({ estilo: 'natural' })}>🌿 Natural</button>
                <button className={`opt ${pro ? 'on' : ''}`} disabled={!!paso} onClick={() => cambiar({ estilo: 'pro' })}>⚡ Pro / Llamativo</button>
              </div>
              <p className="vr-nota">{pro
                ? 'Captions con rebote y la palabra clave en amarillo, emojis 3D, zoom, transiciones, sonidos y cierre con el producto. Prendé o apagá lo que quieras:'
                : 'Corta las pausas, acercamientos suaves en los cortes y subtítulos sutiles en español. Para que parezca un video real.'}</p>
              {pro ? (
                <>
                  <div className="lz-chips">
                    {CAPAS.map((c) => (
                      <button key={c.id} className={`opt ${op[c.id] ? 'on' : ''}`} disabled={!!paso} onClick={() => cambiar({ [c.id]: !op[c.id] })}>{c.label}</button>
                    ))}
                  </div>
                  {op.cierre ? (
                    <div className="panel" style={{ marginTop: 10, padding: 12 }}>
                      <div className="vr-tit chico" style={{ marginTop: 0 }}>🎬 Cierre (3 s al final)</div>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 6 }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {op.foto ? <img src={op.foto} alt="Producto" style={{ width: 56, height: 72, objectFit: 'cover', borderRadius: 8 }} /> : null}
                        <label className="btn-soft" style={{ cursor: subiendoFoto ? 'wait' : 'pointer', flex: 1, textAlign: 'center' }}>
                          <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} disabled={subiendoFoto || !!paso}
                            onChange={(e) => { subirFoto(e.target.files?.[0]); e.target.value = ''; }} />
                          {subiendoFoto ? 'Subiendo…' : op.foto ? '📷 Cambiar foto del producto' : '📷 Subir foto del producto'}
                        </label>
                      </div>
                      <p className="vr-nota">Mejor una foto de estudio (producto solo, fondo liso).</p>
                      <input className="input" placeholder="Marca (opcional)" value={op.marca ?? ''} maxLength={30} disabled={!!paso} onChange={(e) => cambiar({ marca: e.target.value })} style={{ marginTop: 6, width: '100%' }} />
                      {[0, 1, 2].map((i) => (
                        <input key={i} className="input" placeholder={`Beneficio ${i + 1} (opcional)`} maxLength={40} disabled={!!paso} style={{ marginTop: 6, width: '100%' }}
                          value={op.beneficios?.[i] ?? ''}
                          onChange={(e) => { const b = [...(op.beneficios ?? ['', '', ''])]; b[i] = e.target.value; cambiar({ beneficios: b }); }} />
                      ))}
                      <input className="input" placeholder="Llamado a la acción (ej. Probalo hoy)" value={op.cta ?? ''} maxLength={24} disabled={!!paso} onChange={(e) => cambiar({ cta: e.target.value })} style={{ marginTop: 6, width: '100%' }} />
                      <p className="vr-nota">Lo que dejes vacío lo completa la IA con lo que se dice en el video (nunca inventa precios ni descuentos).</p>
                    </div>
                  ) : null}
                </>
              ) : null}
              <button className="btn-grad shine" style={{ width: '100%', marginTop: 12 }} disabled={!!paso || costo === null || subiendoFoto} onClick={editar}>
                {paso ? 'Editando…' : costo === null ? 'Calculando…' : `✂️ Editar · ≈ ${fmt(costo)} créditos (${usd(costo)})`}
              </button>
              {paso ? <p className="sub" style={{ fontSize: 13, margin: '8px 0 0' }}>{PASOS[paso] ?? 'Trabajando…'}</p> : null}
              <p className="sub" style={{ fontSize: 12, margin: '8px 0 0' }}>No agrega música ni B-roll: la música la ponés vos.</p>
            </>
          )}

          {error ? <p className="errbox" style={{ marginTop: 10 }}>{error}</p> : null}
        </div>
      </div>
    </div>
  );
}
