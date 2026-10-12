'use client';

import { guardarPrefSonido } from '@/lib/cliente/video';

/** Dos botones para elegir si el video se sube sin sonido o con sonido (se acuerda de lo último). */
export default function ElegirSonido({ sin, onCambio, chico }: { sin: boolean; onCambio: (sin: boolean) => void; chico?: boolean }) {
  const elegir = (s: boolean) => { guardarPrefSonido(s); onCambio(s); };
  return (
    <div className={`sonido ${chico ? 'chico' : ''}`}>
      <div className="sonido-btns">
        <button type="button" className={`opt ${sin ? 'on' : ''}`} onClick={() => elegir(true)}>🔇 Sin sonido</button>
        <button type="button" className={`opt ${!sin ? 'on' : ''}`} onClick={() => elegir(false)}>🔊 Con sonido</button>
      </div>
      <p className="sonido-nota">
        {sin
          ? 'Se le saca el audio al subirlo (recomendado si es música con derechos de autor).'
          : 'Se sube con su audio y el video final sale con ese mismo sonido, sincronizado.'}
      </p>
    </div>
  );
}
