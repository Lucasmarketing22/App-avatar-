'use client';

import { useEffect, useRef, useState } from 'react';

import { GUIAS, type GuiaId } from '@/lib/estudio/guias';

/** Elige la mejor voz en español que tenga el celu (prioriza Argentina / Latinoamérica). */
function vozEspanol(): SpeechSynthesisVoice | undefined {
  const vs = window.speechSynthesis?.getVoices?.() ?? [];
  const es = vs.filter((v) => v.lang?.toLowerCase().startsWith('es'));
  const pref = ['es-ar', 'es-mx', 'es-419', 'es-us', 'es-co', 'es-cl', 'es-es'];
  for (const p of pref) { const v = es.find((x) => x.lang.toLowerCase() === p); if (v) return v; }
  return es[0];
}

/**
 * Botón "❓ ¿Cómo se usa?" + tarjeta con los pasos. "🔊 Escuchar" los lee en
 * voz alta con la voz del propio celu (gratis, sin gastar créditos).
 */
export default function Guia({ id, chico, texto }: { id: GuiaId; chico?: boolean; texto?: string }) {
  const g = GUIAS[id];
  const [abierta, setAbierta] = useState(false);
  const [hablando, setHablando] = useState(-1);
  const cancelado = useRef(false);
  const puedeHablar = typeof window !== 'undefined' && 'speechSynthesis' in window;

  useEffect(() => () => { cancelado.current = true; window.speechSynthesis?.cancel(); }, []);

  function parar() { cancelado.current = true; window.speechSynthesis?.cancel(); setHablando(-1); }
  function escuchar(desde = 0) {
    if (!puedeHablar) return;
    window.speechSynthesis.cancel();
    cancelado.current = false;
    const voz = vozEspanol();
    const decir = (i: number) => {
      if (cancelado.current || i >= g.pasos.length) { setHablando(-1); return; }
      setHablando(i);
      const u = new SpeechSynthesisUtterance(`${i + 1}. ${g.pasos[i]}`);
      u.lang = voz?.lang ?? 'es-AR';
      if (voz) u.voice = voz;
      u.rate = 1;
      u.onend = () => decir(i + 1);
      u.onerror = () => setHablando(-1);
      window.speechSynthesis.speak(u);
    };
    decir(desde);
  }
  function cerrar() { parar(); setAbierta(false); }

  return (
    <>
      <button className={`guia-btn ${chico ? 'chico' : ''}`} onClick={() => setAbierta(true)}>❓ {texto ?? '¿Cómo se usa?'}</button>
      {abierta ? (
        <div className="ov guia-ov" onClick={cerrar}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <span className="modal-title">❓ {g.titulo}</span>
              <button className="modal-x" onClick={cerrar}>×</button>
            </div>
            <div className="modal-body">
              {puedeHablar ? (
                hablando >= 0
                  ? <button className="btn-soft guia-play" onClick={parar}>⏹ Parar</button>
                  : <button className="btn-grad guia-play" onClick={() => escuchar(0)}>🔊 Escuchar los pasos</button>
              ) : null}
              <ol className="guia-pasos">
                {g.pasos.map((p, i) => (
                  <li key={i} className={hablando === i ? 'on' : ''} onClick={() => puedeHablar && escuchar(i)}>
                    <span className="guia-n">{i + 1}</span><span>{p}</span>
                  </li>
                ))}
              </ol>
              {puedeHablar ? <p className="sub" style={{ fontSize: 12, margin: '8px 0 0', textAlign: 'center' }}>Tocá un paso para escuchar desde ahí. Si no se oye, sacá el modo silencio del iPhone.</p> : null}
            </div>
            <div className="modal-foot"><button className="btn-grad" onClick={cerrar}>Entendido</button></div>
          </div>
        </div>
      ) : null}
    </>
  );
}
