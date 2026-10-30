'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

import { esperarTarea, subirImagen } from '@/lib/cliente/video';
import {
  FORMATOS, IDIOMAS, OBJETIVOS, promptAnuncio, TONOS,
  type FormatoId, type Idea, type Marca, type ObjetivoId,
} from '@/lib/estudio/anuncios';

const fmt = (n: number) => Math.round(n).toLocaleString('es-AR');
const usd = (n: number) => `US$ ${(n * 0.005).toFixed(2).replace('.', ',')}`;

const NUEVA: Marca = { id: '', nombre: '', rubro: '', logo: '', colores: [], tono: '', publico: '', idioma: 'neutro', productos: [], evitar: '', ts: 0 };

/** Lo que hay que recordar del anuncio en curso (se guarda en el celu por si se cierra la app). */
type Estado = {
  marcaId: string;
  objetivo: ObjetivoId;
  formato: FormatoId;
  detalle: string;
  productos: string[];
  ideas: Idea[];
  /** Imagen creada de cada idea (por posición). */
  hechas: Record<number, string>;
};
const VACIO: Estado = { marcaId: '', objetivo: 'promo', formato: '4:5', detalle: '', productos: [], ideas: [], hechas: {} };
const CLAVE = 'musa-clientes-v1';

/**
 * Clientes: una ficha por marca (logo, colores, tono, productos) y anuncios en
 * foto con el texto ya puesto. La IA escribe 3 ideas; se corrigen los textos
 * si hace falta y se crea la que guste (o las 3) con Nano Banana Pro.
 */
export default function Clientes(p: {
  costoFoto: number | null;
  onCreacion: (c: { url: string; prompt: string; refs: string[]; aspect: string; credits?: number }) => void;
  onPublicar: (url: string, tipo: 'foto' | 'video') => void;
  onGuardar: (url: string, tipo: 'foto' | 'video') => void;
  onTrabajo: (msg: string) => void;
  onSaldo: () => void;
}) {
  const { costoFoto, onCreacion, onPublicar, onGuardar, onTrabajo, onSaldo } = p;
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [cargando, setCargando] = useState(true);
  const [ficha, setFicha] = useState<Marca | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState('');
  const [e, setE] = useState<Estado>(VACIO);
  const [escribiendo, setEscribiendo] = useState(false);
  const [creando, setCreando] = useState<number[]>([]);
  const [copiado, setCopiado] = useState(-1);
  const [error, setError] = useState('');
  const vivo = useRef(true);
  useEffect(() => { vivo.current = true; return () => { vivo.current = false; }; }, []);

  useEffect(() => {
    try { const g = localStorage.getItem(CLAVE); if (g) setE({ ...VACIO, ...JSON.parse(g) }); } catch { /* */ }
    fetch('/api/marcas').then((r) => r.json()).then((d) => setMarcas(Array.isArray(d.items) ? d.items : [])).catch(() => undefined).finally(() => setCargando(false));
  }, []);
  useEffect(() => { try { localStorage.setItem(CLAVE, JSON.stringify(e)); } catch { /* */ } }, [e]);
  useEffect(() => {
    onTrabajo(creando.length ? `🏷️ Clientes: creando ${creando.length === 1 ? 'el anuncio' : `${creando.length} anuncios`}…` : escribiendo ? '🏷️ Clientes: escribiendo las ideas…' : '');
  }, [creando, escribiendo, onTrabajo]);

  const marca = marcas.find((m) => m.id === e.marcaId) ?? null;
  const set = (x: Partial<Estado>) => setE((v) => ({ ...v, ...x }));

  function elegirMarca(id: string) {
    const m = marcas.find((x) => x.id === id);
    set({ marcaId: id, productos: m?.productos.slice(0, 1).map((x) => x.url) ?? [], ideas: [], hechas: {} });
    setError('');
  }

  /* ---------- Ficha de la marca ---------- */

  async function subirFicha(ev: React.ChangeEvent<HTMLInputElement>, cual: 'logo' | 'producto') {
    const files = Array.from(ev.target.files ?? []); ev.target.value = '';
    if (!files.length || !ficha) return;
    setSubiendo(cual); setError('');
    try {
      if (cual === 'logo') {
        const url = await subirImagen(files[0], 'marcas');
        setFicha((f) => (f ? { ...f, logo: url } : f));
      } else {
        const urls = await Promise.all(files.slice(0, 12 - ficha.productos.length).map((f) => subirImagen(f, 'marcas')));
        setFicha((f) => (f ? { ...f, productos: [...f.productos, ...urls.map((url) => ({ url, nombre: '' }))].slice(0, 12) } : f));
      }
    } catch (er) {
      setError(er instanceof Error ? er.message : 'No se pudo subir la foto.');
    } finally { setSubiendo(''); }
  }

  async function guardarFicha() {
    if (!ficha || guardando) return;
    if (!ficha.nombre.trim()) { setError('Poné el nombre de la marca.'); return; }
    setGuardando(true); setError('');
    try {
      const res = await fetch('/api/marcas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ficha) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.id) throw new Error(d.error ?? 'No se pudo guardar la marca.');
      const nueva = d as Marca;
      setMarcas((l) => [nueva, ...l.filter((m) => m.id !== nueva.id)]);
      setFicha(null);
      // Marca nueva: queda elegida. La misma: se sacan de la selección las fotos que se borraron.
      if (e.marcaId !== nueva.id) set({ marcaId: nueva.id, productos: nueva.productos.slice(0, 1).map((x) => x.url), ideas: [], hechas: {} });
      else set({ productos: e.productos.filter((u) => nueva.productos.some((x) => x.url === u)) });
    } catch (er) {
      setError(er instanceof Error ? er.message : 'No se pudo guardar la marca.');
    } finally { setGuardando(false); }
  }

  async function borrarMarca() {
    if (!ficha?.id || !window.confirm(`¿Borrar la marca ${ficha.nombre}? Las fotos que ya creaste quedan en la Galería.`)) return;
    await fetch(`/api/marcas?id=${encodeURIComponent(ficha.id)}`, { method: 'DELETE' }).catch(() => undefined);
    setMarcas((l) => l.filter((m) => m.id !== ficha.id));
    if (e.marcaId === ficha.id) set({ ...VACIO });
    setFicha(null);
  }

  /* ---------- Anuncios ---------- */

  async function escribirIdeas() {
    if (!marca || escribiendo || creando.length) return;
    setEscribiendo(true); setError('');
    try {
      const res = await fetch('/api/anuncios', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marcaId: marca.id, objetivo: e.objetivo, formato: e.formato, detalle: e.detalle, productos: e.productos }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(d.ideas)) throw new Error(d.error ?? 'No se pudieron escribir las ideas.');
      set({ ideas: d.ideas, hechas: {} });
      onSaldo();
    } catch (er) {
      setError(er instanceof Error ? er.message : 'No se pudieron escribir las ideas.');
    } finally { if (vivo.current) setEscribiendo(false); }
  }

  function editarIdea(i: number, x: Partial<Idea>) {
    setE((v) => ({ ...v, ideas: v.ideas.map((idea, j) => (j === i ? { ...idea, ...x } : idea)) }));
  }

  async function crear(cuales: number[]) {
    if (!marca || !cuales.length) return;
    const n = cuales.length;
    const c = costoFoto;
    const cuanto = c !== null ? `≈ ${fmt(c * n)} créditos (${usd(c * n)})` : `lo de ${n === 1 ? 'una foto' : `${n} fotos`} en Nano Banana Pro`;
    if (!window.confirm(`Crear ${n === 1 ? 'este anuncio' : `los ${n} anuncios`} de ${marca.nombre} (${e.formato}).\n\nRevisá que los textos estén bien escritos: salen tal cual.\n\nCuesta ${cuanto}.\n\n¿Seguimos?`)) return;
    setError(''); setCreando((l) => [...l, ...cuales]);
    const productos = marca.productos.filter((x) => e.productos.includes(x.url)).map((x) => x.url).slice(0, 6);
    const refs = [...productos, ...(marca.logo ? [marca.logo] : [])];
    await Promise.all(cuales.map(async (i) => {
      const idea = e.ideas[i];
      try {
        const prompt = promptAnuncio(marca, idea, e.formato, productos.length, !!marca.logo);
        const res = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, imageUrls: refs, aspect: e.formato, modelo: 'nanopro' }) });
        const d = await res.json().catch(() => ({}));
        if (!res.ok || !d.taskId) throw new Error(d.error ?? 'No se pudo crear el anuncio.');
        const r = await esperarTarea(d.taskId, () => vivo.current);
        onCreacion({ url: r.url, prompt, refs, aspect: e.formato, credits: r.credits });
        setE((v) => ({ ...v, hechas: { ...v.hechas, [i]: r.url } }));
      } catch (er) {
        if (!(er instanceof Error && er.message === 'cancelado')) setError(`Anuncio ${i + 1}: ${er instanceof Error ? er.message : 'no se pudo crear.'}`);
      } finally {
        if (vivo.current) setCreando((l) => l.filter((x) => x !== i));
      }
    }));
    onSaldo();
  }

  async function copiar(i: number, texto: string) {
    try { await navigator.clipboard.writeText(texto); setCopiado(i); setTimeout(() => setCopiado(-1), 1800); } catch { window.prompt('Copiá el texto:', texto); }
  }

  /* ---------- Pantalla ---------- */

  if (ficha) {
    const f = ficha;
    const cambiar = (x: Partial<Marca>) => setFicha({ ...f, ...x });
    return (
      <div className="vr">
        <div className="panel vr-paso">
          <div className="vr-tit">{f.id ? `✏️ ${f.nombre || 'Marca'}` : '＋ Nueva marca'}</div>
          <label className="vr-tit chico">Nombre</label>
          <input className="input" style={{ width: '100%' }} value={f.nombre} maxLength={60} placeholder="Ej: Café Lumbre" onChange={(ev) => cambiar({ nombre: ev.target.value })} />
          <label className="vr-tit chico">A qué se dedica</label>
          <input className="input" style={{ width: '100%' }} value={f.rubro} maxLength={120} placeholder="Ej: cafetería de especialidad en Palermo" onChange={(ev) => cambiar({ rubro: ev.target.value })} />

          <label className="vr-tit chico">Logo</label>
          <div className="vr-fila" style={{ marginTop: 0 }}>
            {f.logo ? <span className="vr-th" style={{ background: '#fff' }}><Image src={f.logo} alt="Logo" fill sizes="54px" style={{ objectFit: 'contain' }} /></span> : null}
            <label className="btn-soft vr-lbl" style={{ flex: 1, padding: '10px 12px' }}>
              <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} disabled={!!subiendo} onChange={(ev) => subirFicha(ev, 'logo')} />
              {subiendo === 'logo' ? 'Subiendo…' : f.logo ? '🔄 Cambiar logo' : '⬆ Subir logo (mejor PNG sin fondo)'}
            </label>
            {f.logo ? <button className="btn-ghost" onClick={() => cambiar({ logo: '' })}>Quitar</button> : null}
          </div>

          <label className="vr-tit chico">Colores de la marca</label>
          <div className="vr-fila" style={{ marginTop: 0, flexWrap: 'wrap' }}>
            {f.colores.map((c, i) => (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <input type="color" value={c} aria-label={`Color ${i + 1}`} style={{ width: 44, height: 44, border: 'none', background: 'none', padding: 0 }} onChange={(ev) => cambiar({ colores: f.colores.map((x, j) => (j === i ? ev.target.value : x)) })} />
                <button className="xbtn" style={{ position: 'static' }} aria-label="Quitar color" onClick={() => cambiar({ colores: f.colores.filter((_, j) => j !== i) })}>×</button>
              </span>
            ))}
            {f.colores.length < 4 ? <button className="opt" onClick={() => cambiar({ colores: [...f.colores, '#e5397f'] })}>＋ Color</button> : null}
          </div>

          <label className="vr-tit chico">Tono</label>
          <div className="lz-chips">
            {TONOS.map((t) => <button key={t} className={`opt ${f.tono === t ? 'on' : ''}`} onClick={() => cambiar({ tono: f.tono === t ? '' : t })}>{t}</button>)}
          </div>
          <input className="input" style={{ width: '100%' }} value={TONOS.includes(f.tono) ? '' : f.tono} maxLength={120} placeholder="u otro: ej. elegante pero con humor" onChange={(ev) => cambiar({ tono: ev.target.value })} />

          <label className="vr-tit chico">Idioma de los textos</label>
          <div className="lz-chips">
            {IDIOMAS.map((i) => <button key={i.id} className={`opt ${f.idioma === i.id ? 'on' : ''}`} onClick={() => cambiar({ idioma: i.id })}>{i.label}</button>)}
          </div>

          <label className="vr-tit chico">Público</label>
          <input className="input" style={{ width: '100%' }} value={f.publico} maxLength={200} placeholder="Ej: mujeres de 25 a 40 que trabajan en oficina" onChange={(ev) => cambiar({ publico: ev.target.value })} />

          <label className="vr-tit chico">Fotos de productos</label>
          <div className="vr-fotos" style={{ marginTop: 0 }}>
            {f.productos.map((x, i) => (
              <div key={x.url}>
                <div className="vr-big" style={{ aspectRatio: '1 / 1' }}>
                  <Image src={x.url} alt={x.nombre || `Producto ${i + 1}`} fill sizes="90px" />
                  <button className="xbtn" aria-label="Quitar" onClick={() => cambiar({ productos: f.productos.filter((_, j) => j !== i) })}>×</button>
                </div>
                <input className="input" style={{ width: '100%', height: 32, fontSize: 12, padding: '0 6px', marginTop: 4 }} value={x.nombre} maxLength={60} placeholder="Nombre" onChange={(ev) => cambiar({ productos: f.productos.map((y, j) => (j === i ? { ...y, nombre: ev.target.value } : y)) })} />
              </div>
            ))}
            {f.productos.length < 12 ? (
              <label className="upload-tile" style={{ aspectRatio: '1 / 1', cursor: 'pointer' }}>
                <input type="file" accept="image/png,image/jpeg,image/webp" multiple style={{ display: 'none' }} disabled={!!subiendo} onChange={(ev) => subirFicha(ev, 'producto')} />
                <span style={{ fontSize: 22, color: 'var(--rosa)' }}>＋</span>
                <span className="sub" style={{ fontSize: 11 }}>{subiendo === 'producto' ? 'Subiendo…' : 'Subir'}</span>
              </label>
            ) : null}
          </div>
          <p className="vr-nota">Fotos reales del cliente: el producto sale igual que en la foto (forma, colores y etiqueta).</p>

          <label className="vr-tit chico">Nunca mostrar ni decir</label>
          <input className="input" style={{ width: '100%' }} value={f.evitar} maxLength={300} placeholder="Ej: alcohol, la competencia, precios" onChange={(ev) => cambiar({ evitar: ev.target.value })} />

          <button className={`btn-grad ${guardando ? 'busy' : ''}`} style={{ width: '100%', marginTop: 14 }} disabled={guardando || !!subiendo} onClick={guardarFicha}>{guardando ? 'Guardando…' : '💾 Guardar marca'}</button>
          <div className="vr-fila">
            <button className="btn-soft" style={{ flex: 1 }} disabled={guardando} onClick={() => { setFicha(null); setError(''); }}>Cancelar</button>
            {f.id ? <button className="btn-ghost" style={{ flex: 1 }} disabled={guardando} onClick={borrarMarca}>🗑 Borrar marca</button> : null}
          </div>
          {error ? <p className="errbox" style={{ marginTop: 10 }}>{error}</p> : null}
        </div>
      </div>
    );
  }

  const ocupado = escribiendo || creando.length > 0;
  return (
    <div className="vr">
      <p className="sub" style={{ marginTop: 0 }}>Anuncios en foto para tus clientes, con el texto ya puesto. Cargá la marca una vez y pedí ideas cuando quieras.</p>

      {/* 1. La marca */}
      <div className="panel vr-paso">
        <div className="vr-tit"><span className="vr-n">1</span> La marca</div>
        {cargando ? <p className="vr-nota" style={{ marginTop: 0 }}>Cargando tus marcas…</p> : null}
        <div className="lz-chips">
          {marcas.map((m) => <button key={m.id} className={`opt ${m.id === e.marcaId ? 'on' : ''}`} disabled={ocupado} onClick={() => elegirMarca(m.id)}>{m.nombre}</button>)}
          <button className="opt" disabled={ocupado} onClick={() => { setFicha({ ...NUEVA }); setError(''); }}>＋ Nueva marca</button>
        </div>
        {marca ? (
          <div className="vr-fila">
            {marca.logo ? <span className="vr-th" style={{ background: '#fff', width: 44, height: 44 }}><Image src={marca.logo} alt="" fill sizes="44px" style={{ objectFit: 'contain' }} /></span> : null}
            <span style={{ flex: 1, fontSize: 13, color: 'var(--muted)', lineHeight: 1.35 }}>
              {[marca.rubro, marca.tono, IDIOMAS.find((i) => i.id === marca.idioma)?.label].filter(Boolean).join(' · ')}
              <span style={{ display: 'flex', gap: 4, marginTop: 4 }}>{marca.colores.map((c) => <span key={c} style={{ width: 16, height: 16, borderRadius: 4, background: c, border: '1px solid var(--line)' }} />)}</span>
            </span>
            <button className="btn-soft" disabled={ocupado} onClick={() => { setFicha({ ...marca }); setError(''); }}>✏️ Editar</button>
          </div>
        ) : !cargando && !marcas.length ? <p className="vr-nota">Empezá cargando la primera marca: nombre, logo, colores y fotos de sus productos.</p> : null}
      </div>

      {/* 2. El anuncio */}
      <div className="panel vr-paso">
        <div className="vr-tit"><span className="vr-n">2</span> El anuncio</div>
        <label className="vr-tit chico" style={{ marginTop: 0 }}>Para qué es</label>
        <div className="lz-chips">
          {OBJETIVOS.map((o) => <button key={o.id} className={`opt ${e.objetivo === o.id ? 'on' : ''}`} disabled={ocupado} onClick={() => set({ objetivo: o.id })}>{o.label}</button>)}
        </div>
        <label className="vr-tit chico">Formato</label>
        <div className="lz-chips">
          {FORMATOS.map((f) => <button key={f.id} className={`opt ${e.formato === f.id ? 'on' : ''}`} disabled={ocupado} onClick={() => set({ formato: f.id })}>{f.label}</button>)}
        </div>
        {marca?.productos.length ? (
          <>
            <label className="vr-tit chico">Productos que aparecen</label>
            <div className="vr-fotos" style={{ marginTop: 0 }}>
              {marca.productos.map((x, i) => {
                const on = e.productos.includes(x.url);
                return (
                  <button key={x.url} className={`lz-th ${on ? 'on' : ''}`} style={{ width: '100%', height: 'auto', aspectRatio: '1 / 1' }} disabled={ocupado} title={x.nombre}
                    onClick={() => set({ productos: on ? e.productos.filter((u) => u !== x.url) : [...e.productos, x.url].slice(0, 6) })}>
                    <Image src={x.url} alt={x.nombre || `Producto ${i + 1}`} fill sizes="80px" />
                    {on ? <small style={{ position: 'absolute', top: 4, right: 4, background: 'var(--rosa)', color: '#fff', borderRadius: 999, width: 20, height: 20, fontSize: 12, display: 'grid', placeItems: 'center' }}>✓</small> : null}
                  </button>
                );
              })}
            </div>
          </>
        ) : null}
        <label className="vr-tit chico">Qué querés comunicar</label>
        <textarea className="textarea" rows={3} maxLength={600} value={e.detalle} disabled={ocupado} placeholder="Ej: 2x1 en cafés de 8 a 10 h, solo esta semana" onChange={(ev) => set({ detalle: ev.target.value })} />
        <p className="vr-nota">Precios, fechas y datos van tal cual los escribas: la IA no inventa ninguno.</p>
        <button className={`btn-grad shine ${escribiendo ? 'busy' : ''}`} style={{ width: '100%', marginTop: 10 }} disabled={!marca || ocupado} onClick={escribirIdeas}>
          {escribiendo ? 'Escribiendo 3 ideas…' : e.ideas.length ? '🔄 Otras 3 ideas' : '✍️ Escribir 3 ideas'}
        </button>
        <p className="vr-nota">Las ideas cuestan unos pocos créditos (centavos). La imagen se paga recién cuando la creás.</p>
      </div>

      {/* 3. Ideas */}
      {e.ideas.length && marca ? (
        <div className="panel vr-paso">
          <div className="vr-tit"><span className="vr-n">3</span> Elegí y creá</div>
          <p className="vr-nota" style={{ marginTop: 0 }}>Corregí los textos si hace falta: salen escritos tal cual en la imagen.</p>
          {e.ideas.map((idea, i) => {
            const hecha = e.hechas[i];
            const enCurso = creando.includes(i);
            return (
              <div key={i} style={{ borderTop: i ? '1px solid var(--line)' : 'none', paddingTop: i ? 14 : 4, marginTop: i ? 14 : 4 }}>
                <b style={{ fontSize: 14 }}>Idea {i + 1}{idea.estilo ? ` · ${idea.estilo}` : ''}</b>
                <label className="vr-tit chico">Titular</label>
                <input className="input" style={{ width: '100%' }} value={idea.titular} maxLength={80} disabled={enCurso} onChange={(ev) => editarIdea(i, { titular: ev.target.value })} />
                <label className="vr-tit chico">Texto chico</label>
                <input className="input" style={{ width: '100%' }} value={idea.bajada} maxLength={140} disabled={enCurso} onChange={(ev) => editarIdea(i, { bajada: ev.target.value })} />
                <label className="vr-tit chico">Botón</label>
                <input className="input" style={{ width: '100%' }} value={idea.boton} maxLength={40} disabled={enCurso} onChange={(ev) => editarIdea(i, { boton: ev.target.value })} />
                <label className="vr-tit chico">Texto para publicar</label>
                <textarea className="textarea" rows={4} value={idea.caption} maxLength={1200} onChange={(ev) => editarIdea(i, { caption: ev.target.value })} />
                <button className="btn-soft" style={{ width: '100%', marginTop: 6 }} onClick={() => copiar(i, idea.caption)}>{copiado === i ? '✅ Copiado' : '📋 Copiar texto'}</button>
                {hecha ? (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ position: 'relative', width: '100%', aspectRatio: e.formato.replace(':', ' / '), borderRadius: 12, overflow: 'hidden', background: 'var(--surface-2)' }}>
                      <Image src={hecha} alt={`Anuncio ${i + 1}`} fill sizes="400px" style={{ objectFit: 'contain' }} />
                    </div>
                    <div className="vr-fila">
                      <button className="btn-grad" style={{ flex: 1 }} onClick={() => onGuardar(hecha, 'foto')}>⬇ Guardar</button>
                      <button className="btn-soft" style={{ flex: 1 }} onClick={() => onPublicar(hecha, 'foto')}>📤 Publicar</button>
                    </div>
                  </div>
                ) : null}
                <button className={`${hecha ? 'btn-soft' : 'btn-grad'} ${enCurso ? 'busy' : ''}`} style={{ width: '100%', marginTop: 8 }} disabled={enCurso || escribiendo || !idea.titular.trim()} onClick={() => crear([i])}>
                  {enCurso ? 'Creando el anuncio… (~1 min)' : hecha ? '🔄 Crear otra versión' : `🎨 Crear este anuncio${costoFoto !== null ? ` · ≈ ${fmt(costoFoto)} créditos` : ''}`}
                </button>
              </div>
            );
          })}
          {e.ideas.length > 1 && !creando.length && !Object.keys(e.hechas).length ? (
            <button className="btn-grad shine" style={{ width: '100%', marginTop: 16 }} disabled={escribiendo || e.ideas.some((x) => !x.titular.trim())} onClick={() => crear(e.ideas.map((_, i) => i))}>
              🎨 Crear las {e.ideas.length}{costoFoto !== null ? ` · ≈ ${fmt(costoFoto * e.ideas.length)} créditos (${usd(costoFoto * e.ideas.length)})` : ''}
            </button>
          ) : null}
          <p className="vr-nota">Se crean con Nano Banana Pro (el que mejor escribe texto). Todo queda también en tu Galería.</p>
        </div>
      ) : null}
      {error ? <p className="errbox" style={{ marginTop: 10 }}>{error}</p> : null}
    </div>
  );
}
