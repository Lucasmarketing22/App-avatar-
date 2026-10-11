'use client';

import { useEffect, useState } from 'react';

/** Link que fuerza la descarga (Vercel Blob acepta ?download=1). */
export function linkDescarga(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.endsWith('.public.blob.vercel-storage.com')) { u.searchParams.set('download', '1'); return u.toString(); }
  } catch { /* */ }
  return url;
}

/**
 * Hoja "Guardar": en el iPhone, "Guardar en Fotos" abre el menú del celu con
 * el archivo (opción "Guardar video/imagen" → va al carrete). El archivo se
 * prepara al abrir la hoja para que el toque lo comparta al instante.
 */
export default function Guardar(props: { url: string; tipo: 'foto' | 'video'; onClose: () => void }) {
  const { url, tipo, onClose } = props;
  const [archivo, setArchivo] = useState<File | null>(null);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error'>('cargando');
  const [aviso, setAviso] = useState('');

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(url);
        if (!r.ok) throw new Error();
        const b = await r.blob();
        const ext = tipo === 'video' ? (b.type.includes('webm') ? 'webm' : b.type.includes('quicktime') ? 'mov' : 'mp4') : b.type.includes('png') ? 'png' : 'jpg';
        if (vivo) { setArchivo(new File([b], `musa-${Date.now()}.${ext}`, { type: b.type || (tipo === 'video' ? 'video/mp4' : 'image/jpeg') })); setEstado('listo'); }
      } catch { if (vivo) setEstado('error'); }
    })();
    return () => { vivo = false; };
  }, [url, tipo]);

  const puedeCompartir = !!archivo && typeof navigator !== 'undefined' && !!navigator.canShare && navigator.canShare({ files: [archivo] });

  function guardarEnFotos() {
    if (!archivo) return;
    if (puedeCompartir) {
      navigator.share({ files: [archivo] })
        .then(() => setAviso('✅ Listo. Si elegiste "Guardar", ya está en tus Fotos.'))
        .catch((e: unknown) => { if ((e as { name?: string })?.name !== 'AbortError') setAviso('No se pudo abrir el menú. Usá "Descargar archivo".'); });
      return;
    }
    // Compu: descarga directa del archivo ya preparado.
    const a = document.createElement('a');
    const u = URL.createObjectURL(archivo);
    a.href = u; a.download = archivo.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 4000);
    setAviso('✅ Descargado.');
  }

  return (
    <div className="ov pub-ov" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">💾 Guardar {tipo === 'video' ? 'video' : 'foto'}</span>
          <button className="modal-x" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="pub-media">
            {tipo === 'video'
              ? <video src={url} muted playsInline controls preload="metadata" />
              // eslint-disable-next-line @next/next/no-img-element
              : <img src={url} alt="" />}
          </div>
          <button className="btn-grad shine" style={{ width: '100%', marginTop: 12 }} disabled={estado !== 'listo'} onClick={guardarEnFotos}>
            {estado === 'cargando' ? `Preparando ${tipo === 'video' ? 'el video' : 'la foto'}…` : estado === 'error' ? 'No se pudo preparar' : puedeCompartir ? '💾 Guardar en Fotos' : '💾 Descargar'}
          </button>
          {puedeCompartir ? <p className="sub" style={{ fontSize: 12, margin: '6px 0 0', textAlign: 'center' }}>Se abre el menú del celu: tocá <b>“Guardar {tipo === 'video' ? 'video' : 'imagen'}”</b>.</p> : null}
          <a className="btn-ghost" href={linkDescarga(url)} download style={{ display: 'block', textAlign: 'center', marginTop: 10 }}>⬇ Descargar archivo</a>
          <p className="sub" style={{ fontSize: 12, margin: '6px 0 0', textAlign: 'center' }}>Va a la carpeta Descargas (app Archivos).</p>
          {aviso ? <p className="costo ok" style={{ marginTop: 10 }}>{aviso}</p> : null}
        </div>
      </div>
    </div>
  );
}
