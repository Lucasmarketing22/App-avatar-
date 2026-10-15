'use client';

import { useEffect, useState } from 'react';

import { guardarModoRopa, prefModoRopa, type ModoRopa as Modo } from '@/lib/cliente/vestuario';

/**
 * Elegir cómo se usa la foto de la ropa: cuidando el cuerpo de la modelo (la
 * IA lee la ropa y la describe) o copiando la ropa exacta (la foto va tal cual
 * y puede arrastrar el cuerpo de quien la tiene puesta).
 */
export default function ModoRopa({ nombre, chico }: { nombre: string; chico?: boolean }) {
  const [modo, setModo] = useState<Modo>('cuerpo');
  useEffect(() => { setModo(prefModoRopa()); }, []);
  const elegir = (m: Modo) => { setModo(m); guardarModoRopa(m); };
  return (
    <div className={`mropa ${chico ? 'chico' : ''}`} data-ui>
      <div className="mropa-btns">
        <button type="button" className={`opt ${modo === 'cuerpo' ? 'on' : ''}`} onClick={() => elegir('cuerpo')}>🧍 Cuidar su cuerpo</button>
        <button type="button" className={`opt ${modo === 'exacta' ? 'on' : ''}`} onClick={() => elegir('exacta')}>📷 Ropa exacta</button>
      </div>
      <p className="mropa-nota">
        {modo === 'cuerpo'
          ? `La IA lee la ropa de la foto y la describe; la foto no se usa. El cuerpo sale como el de ${nombre}, pero un estampado con mucho detalle puede variar un poco.`
          : `La foto se usa tal cual: la ropa sale igual, pero la IA puede copiar el cuerpo de quien la tiene puesta. Va mejor con fotos de la prenda sola, sin persona.`}
      </p>
    </div>
  );
}
