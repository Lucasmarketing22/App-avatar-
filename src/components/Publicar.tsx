'use client';

import { useEffect, useState } from 'react';

import { armarTexto, type Red } from '@/lib/estudio/textos';

/**
 * Hoja "Publicar": arma el texto (descripción + hashtags) y abre el menú de
 * compartir del celular con la foto/video y el texto listos para TikTok,
 * Instagram o LeadConnector. El archivo se descarga al abrir la hoja, así el
 * toque en "Compartir" lo comparte al instante (iPhone exige que sea en el toque).
 */
export default function Publicar(props: { url: string; tipo: 'foto' | 'video'; prompt?: string; nombre?: string; onClose: () => void }) {
  const { url, tipo, prompt, nombre, onClose } = props;
  const [red, setRed] = useState<Red>('instagram');
  const [ia, setIa] = useState(true);
  const [n, setN] = useState(() => Math.floor(Math.random() * 100));
  const [texto, setTexto] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error'>('cargando');
  const [aviso, setAviso] = useState('');

  useEffect(() => { setTexto(armarTexto({ prompt, n, red, ia, nombre })); }, [prompt, n, red, ia, nombre]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(url);
        if (!r.ok) throw new Error();
        const b = await r.blob();
        const ext = tipo === 'video' ? (b.type.includes('quicktime') ? 'mov' : 'mp4') : b.type.includes('png') ? 'png' : 'jpg';
        const tipoMime = b.type || (tipo === 'video' ? 'video/mp4' : 'image/jpeg');
        if (vivo) { setArchivo(new File([b], `${(nombre || 'musa').toLowerCase()}-${Date.now()}.${ext}`, { type: tipoMime })); setEstado('listo'); }
      } catch { if (vivo) setEstado('error'); }
    })();
    return () => { vivo = false; };
  }, [url, tipo, nombre]);

  const puedeCompartirArchivo = !!archivo && typeof navigator !== 'undefined' && !!navigator.canShare && navigator.canShare({ files: [archivo] });

  function copiar() {
    navigator.clipboard?.writeText(texto).catch(() => undefined);
    setAviso('📋 Texto copiado. Pegalo en la descripción.');
  }

  function compartir() {
    // Copiamos el texto también: TikTok e Instagram a veces ignoran el texto compartido.
    navigator.clipboard?.writeText(texto).catch(() => undefined);
    if (archivo && puedeCompartirArchivo) {
      navigator.share({ files: [archivo], text: texto })
        .then(() => setAviso('✅ ¡Listo! Si la app no pegó el texto, mantené apretado y "Pegar" (ya está copiado).'))
        .catch((e: unknown) => { if ((e as { name?: string })?.name !== 'AbortError') setAviso('No se pudo abrir el menú de compartir. Usá "Descargar" y "Copiar texto".'); });
    } else {
      setAviso('Este navegador no deja compartir archivos. Descargalo con el botón de abajo; el texto ya está copiado.');
    }
  }

  return (
    <div className="ov pub-ov" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">📤 Publicar {tipo === 'video' ? 'video' : 'foto'}</span>
          <button className="modal-x" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="pub-media">
            {tipo === 'video'
              ? <video src={url} muted playsInline controls preload="metadata" />
              // eslint-disable-next-line @next/next/no-img-element
              : <img src={url} alt="" />}
          </div>

          <div className="aplbl">¿Para qué red?</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className={`opt ${red === 'instagram' ? 'on' : ''}`} onClick={() => setRed('instagram')}>📸 Instagram</button>
            <button className={`opt ${red === 'tiktok' ? 'on' : ''}`} onClick={() => setRed('tiktok')}>🎵 TikTok</button>
          </div>

          <div className="aplbl">Texto para publicar</div>
          <textarea className="textarea" value={texto} onChange={(e) => setTexto(e.target.value)} style={{ height: 110 }} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            <button className="btn-soft" onClick={() => setN((x) => x + 1)}>🔄 Otro texto</button>
            <button className="btn-soft" onClick={copiar}>📋 Copiar texto</button>
          </div>
          <button className="btn-grad shine" style={{ width: '100%', marginTop: 14 }} disabled={estado !== 'listo'} onClick={compartir}>
            {estado === 'cargando' ? `Preparando ${tipo === 'video' ? 'el video' : 'la foto'}…` : estado === 'error' ? 'No se pudo preparar el archivo' : '📤 Compartir'}
          </button>
          <p className="sub" style={{ fontSize: 12, margin: '6px 0 0', textAlign: 'center' }}>Se abre el menú del celu: elegí TikTok, Instagram o LeadConnector.</p>
          <a className="btn-ghost" href={url} target="_blank" rel="noreferrer" style={{ display: 'block', textAlign: 'center', marginTop: 8 }}>⬇ Descargar</a>
          {aviso ? <p className="costo ok" style={{ marginTop: 10 }}>{aviso}</p> : null}
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={ia} onChange={(e) => setIa(e.target.checked)} style={{ width: 18, height: 18 }} />
            Agregar #ia (recomendado)
          </label>
          <p className="sub" style={{ fontSize: 12, margin: '6px 0 0' }}>💡 Instagram y TikTok piden marcar el contenido hecho con IA: al publicar, activá la etiqueta <b>“Contenido de IA”</b> / <b>“Generado por IA”</b>. Así evitás que te bajen la publicación.</p>

        </div>
      </div>
    </div>
  );
}
