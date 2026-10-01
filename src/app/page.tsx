'use client';

import { useEffect, useRef, useState } from 'react';

import { componerPrompt } from '@/lib/estudio/prompt';
import { CATEGORIAS, type Selecciones } from '@/lib/estudio/piezas';
import { GALERIAS } from '@/lib/estudio/galerias';
import { MODELOS, type ModeloId } from '@/lib/ia/models';

type Personaje = { nombre: string; refs: string[] };
type Item = { id: string; url: string; nombre?: string };
type Creacion = { id: string; url: string; ts: number };
type Phase = 'idle' | 'creating' | 'polling' | 'done' | 'error';
type Vista = 'crear' | 'galeria';

const ASPECTS = ['3:4', '1:1', '4:5', '9:16', '16:9', '4:3'];

async function subir(file: File, folder: string): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  form.append('folder', folder);
  const res = await fetch('/api/upload', { method: 'POST', body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.url) throw new Error(data.error ?? 'No se pudo subir la imagen.');
  return data.url as string;
}

export default function Estudio() {
  const [vista, setVista] = useState<Vista>('crear');

  const [personaje, setPersonaje] = useState<Personaje>({ nombre: '', refs: [] });
  const [vestidos, setVestidos] = useState<Item[]>([]);
  const [vestidoSel, setVestidoSel] = useState<string | null>(null);
  const [galerias, setGalerias] = useState<Record<string, Item[]>>({});
  const [galSel, setGalSel] = useState<Record<string, string | null>>({});
  const [creaciones, setCreaciones] = useState<Creacion[]>([]);

  const [sel, setSel] = useState<Selecciones>({});
  const [extra, setExtra] = useState('');
  const [modelo, setModelo] = useState<ModeloId>('nano');

  const [aspect, setAspect] = useState('3:4');
  const [phase, setPhase] = useState<Phase>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [error, setError] = useState('');
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const [subiendoCara, setSubiendoCara] = useState(false);
  const [subiendoVestido, setSubiendoVestido] = useState(false);
  const [subiendoGal, setSubiendoGal] = useState<Record<string, boolean>>({});
  const [cargando, setCargando] = useState(true);

  const [abierto, setAbierto] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<Creacion | null>(null);
  const [mejorando, setMejorando] = useState<string | null>(null);
  const [upMsg, setUpMsg] = useState('');

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const upTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); if (upTimer.current) clearTimeout(upTimer.current); }, []);

  useEffect(() => {
    (async () => {
      try {
        const [p, v, c] = await Promise.all([
          fetch('/api/personaje').then((r) => r.json()),
          fetch('/api/vestidos').then((r) => r.json()),
          fetch('/api/creaciones').then((r) => r.json()),
        ]);
        if (p && Array.isArray(p.refs)) setPersonaje({ nombre: p.nombre ?? '', refs: p.refs });
        if (v && Array.isArray(v.items)) setVestidos(v.items);
        if (c && Array.isArray(c.items)) setCreaciones(c.items);
        const gals: Record<string, Item[]> = {};
        await Promise.all(GALERIAS.map(async (g) => {
          try { const d = await fetch(`/api/galeria?tipo=${g.key}`).then((r) => r.json()); gals[g.key] = Array.isArray(d.items) ? d.items : []; }
          catch { gals[g.key] = []; }
        }));
        setGalerias(gals);
      } catch { /* vacío */ } finally { setCargando(false); }
    })();
  }, []);

  const busy = phase === 'creating' || phase === 'polling';
  const vestidoActual = vestidos.find((v) => v.id === vestidoSel) ?? null;
  const puedeGenerar = personaje.refs.length > 0 && !busy;
  const modeloLabel = MODELOS.find((m) => m.id === modelo)?.label ?? 'Nano Banana';

  function elegirPieza(catKey: string, id: string) {
    setSel((s) => ({ ...s, [catKey]: s[catKey] === id ? undefined : id }));
  }

  async function guardarPersonaje(next: Personaje) {
    setPersonaje(next);
    try { await fetch('/api/personaje', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) }); } catch { /* */ }
  }

  async function onSubirCara(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []); e.target.value = '';
    if (!files.length) return;
    setError(''); setSubiendoCara(true);
    try {
      const libres = Math.max(0, 3 - personaje.refs.length);
      const nuevos: string[] = [];
      for (const f of files.slice(0, libres)) nuevos.push(await subir(f, 'personaje'));
      await guardarPersonaje({ ...personaje, refs: [...personaje.refs, ...nuevos].slice(0, 3) });
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo subir la foto.'); } finally { setSubiendoCara(false); }
  }
  async function quitarCara(url: string) { await guardarPersonaje({ ...personaje, refs: personaje.refs.filter((u) => u !== url) }); }

  async function onSubirVestido(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []); e.target.value = '';
    if (!files.length) return;
    setError(''); setSubiendoVestido(true);
    try {
      for (const f of files) {
        const url = await subir(f, 'vestidos');
        const res = await fetch('/api/vestidos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
        const nuevo = (await res.json()) as Item;
        if (res.ok && nuevo?.id) setVestidos((prev) => [nuevo, ...prev]);
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo subir el vestido.'); } finally { setSubiendoVestido(false); }
  }
  async function borrarVestido(id: string) {
    setVestidos((prev) => prev.filter((v) => v.id !== id));
    if (vestidoSel === id) setVestidoSel(null);
    await fetch(`/api/vestidos?id=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => undefined);
  }

  async function onSubirGaleria(tipo: string, e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []); e.target.value = '';
    if (!files.length) return;
    setError(''); setSubiendoGal((s) => ({ ...s, [tipo]: true }));
    try {
      for (const f of files) {
        const url = await subir(f, tipo);
        const res = await fetch('/api/galeria', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo, url }) });
        const nuevo = (await res.json()) as Item;
        if (res.ok && nuevo?.id) setGalerias((prev) => ({ ...prev, [tipo]: [nuevo, ...(prev[tipo] ?? [])] }));
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo subir la imagen.'); } finally { setSubiendoGal((s) => ({ ...s, [tipo]: false })); }
  }
  async function borrarItemGal(tipo: string, id: string) {
    setGalerias((prev) => ({ ...prev, [tipo]: (prev[tipo] ?? []).filter((i) => i.id !== id) }));
    setGalSel((prev) => (prev[tipo] === id ? { ...prev, [tipo]: null } : prev));
    await fetch(`/api/galeria?tipo=${tipo}&id=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => undefined);
  }

  async function generar() {
    if (!puedeGenerar) return;
    setAbierto(null); setError(''); setResultUrl(null);
    setPhase('creating'); setStatusMsg('Enviando el pedido a la IA…');
    const refs: { url: string; hint: string }[] = [];
    if (vestidoActual) refs.push({ url: vestidoActual.url, hint: 'Replace her clothing completely with the outfit shown in the outfit reference image, keeping its shape, color, fabric and details faithful.' });
    for (const g of GALERIAS) {
      const item = (galerias[g.key] ?? []).find((i) => i.id === galSel[g.key]);
      if (item) refs.push({ url: item.url, hint: g.hint });
    }
    const imageUrls = [...personaje.refs, ...refs.map((r) => r.url)];
    const prompt = componerPrompt({ hints: refs.map((r) => r.hint), selecciones: sel, extra });
    try {
      const res = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, imageUrls, aspect, modelo }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.taskId) { setError(data.error ?? 'No se pudo crear la generación.'); setPhase('error'); return; }
      setPhase('polling'); setStatusMsg('Generando la imagen… (puede tardar hasta ~1 minuto)');
      poll(data.taskId, 0);
    } catch { setError('No se pudo conectar. Probá de nuevo.'); setPhase('error'); }
  }

  function poll(taskId: string, tries: number) {
    if (tries > 40) { setError('Se tardó demasiado. Probá de nuevo.'); setPhase('error'); return; }
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/status?taskId=${encodeURIComponent(taskId)}`);
        const data = await res.json().catch(() => ({}));
        if (data.state === 'success') {
          setResultUrl(data.url); setPhase('done'); setStatusMsg('');
          if (data.url) setCreaciones((prev) => [{ id: data.url as string, url: data.url as string, ts: Date.now() }, ...prev.filter((c) => c.url !== data.url)]);
          return;
        }
        if (data.state === 'fail' || (!res.ok && data.error)) { setError(data.error ?? 'La generación falló.'); setPhase('error'); return; }
        poll(taskId, tries + 1);
      } catch { poll(taskId, tries + 1); }
    }, 3000);
  }

  async function mejorar(c: Creacion) {
    if (mejorando) return;
    setError(''); setMejorando(c.id); setUpMsg('Mejorando calidad… (puede tardar ~1 min)');
    try {
      const res = await fetch('/api/upscale', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: c.url, factor: '2' }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.taskId) { setError(data.error ?? 'No se pudo mejorar.'); setMejorando(null); setUpMsg(''); return; }
      pollUpscale(data.taskId, 0);
    } catch { setError('No se pudo conectar.'); setMejorando(null); setUpMsg(''); }
  }
  function pollUpscale(taskId: string, tries: number) {
    if (tries > 40) { setError('La mejora tardó demasiado.'); setMejorando(null); setUpMsg(''); return; }
    upTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/status?taskId=${encodeURIComponent(taskId)}`);
        const data = await res.json().catch(() => ({}));
        if (data.state === 'success') {
          if (data.url) setCreaciones((prev) => [{ id: data.url as string, url: data.url as string, ts: Date.now() }, ...prev.filter((x) => x.url !== data.url)]);
          setMejorando(null); setUpMsg('');
          return;
        }
        if (data.state === 'fail' || (!res.ok && data.error)) { setError(data.error ?? 'La mejora falló.'); setMejorando(null); setUpMsg(''); return; }
        pollUpscale(taskId, tries + 1);
      } catch { pollUpscale(taskId, tries + 1); }
    }, 3000);
  }

  function resumenCategoria(key: string): string {
    const cat = CATEGORIAS.find((c) => c.key === key);
    const op = cat?.opciones.find((o) => o.id === sel[key]);
    return op ? op.label : 'Opcional';
  }
  function resumenGaleria(key: string): string {
    const items = galerias[key] ?? [];
    if (galSel[key] && items.some((i) => i.id === galSel[key])) return 'Elegida ✓';
    return items.length ? `${items.length} foto${items.length > 1 ? 's' : ''}` : 'Subí fotos';
  }
  function thumbGaleria(key: string): string | undefined {
    const items = galerias[key] ?? [];
    return (items.find((i) => i.id === galSel[key]) ?? items[0])?.url;
  }
  const salir = () => fetch('/api/logout', { method: 'POST' }).then(() => location.reload());

  return (
    <main className="app-bg">
      {/* Barra lateral (desktop) */}
      <aside className="rail">
        <div className="rail-logo">m</div>
        <button className={`rail-ic ${vista === 'crear' ? 'on' : ''}`} onClick={() => setVista('crear')}>✨<span>Crear</span></button>
        <button className={`rail-ic ${vista === 'galeria' ? 'on' : ''}`} onClick={() => setVista('galeria')}>🖼️<span>Galería</span></button>
        <div className="rail-spacer" />
        <button className="rail-ic" onClick={salir}>⇽<span>Salir</span></button>
      </aside>

      <div className="content"><div className="content-inner">
        <header className="topbar">
          <div className="logo">musa<span className="g">.studio</span></div>
          <span className="pill">Estudio</span>
          <div className="stat"><b>{creaciones.length}</b> creaciones<br />{modeloLabel}</div>
        </header>

        {cargando ? (
          <p className="sub">Cargando tu estudio…</p>
        ) : vista === 'crear' ? (
          <>
            <h1 className="h1" style={{ marginBottom: 4 }}>Armá tu creación</h1>
            <p className="sub" style={{ marginTop: 0, marginBottom: 16 }}>Tocá cada sección para elegir. Todo es opcional menos el personaje.</p>

            <div style={{ display: 'grid', gap: 10 }}>
              <SectionCard emoji="📸" titulo="Personaje" resumen={personaje.refs.length ? `${personaje.refs.length} foto${personaje.refs.length > 1 ? 's' : ''}` : 'Subí la cara'} dest={personaje.refs.length === 0} thumb={personaje.refs[0]} onClick={() => setAbierto('personaje')} />
              <SectionCard emoji="👗" titulo="Vestido" resumen={vestidoActual ? (vestidoActual.nombre || 'Elegido ✓') : vestidos.length ? 'Elegí uno' : 'Subí vestidos'} thumb={vestidoActual?.url} onClick={() => setAbierto('vestidos')} />
              {GALERIAS.map((g) => (
                <SectionCard key={g.key} emoji={g.emoji} titulo={g.titulo} resumen={resumenGaleria(g.key)} thumb={thumbGaleria(g.key)} onClick={() => setAbierto(`gal:${g.key}`)} />
              ))}
              {CATEGORIAS.map((cat) => (
                <SectionCard key={cat.key} emoji={cat.emoji} titulo={cat.titulo} resumen={resumenCategoria(cat.key)} onClick={() => setAbierto(cat.key)} />
              ))}
              <SectionCard emoji="✍️" titulo="Detalle extra" resumen={extra.trim() ? 'Escrito' : 'Opcional'} onClick={() => setAbierto('extra')} />
              <SectionCard emoji="🧠" titulo="Modelo (motor)" resumen={modeloLabel} onClick={() => setAbierto('modelo')} />
            </div>

            <div className="panel" style={{ marginTop: 20, position: 'sticky', bottom: 12, boxShadow: 'var(--sh-md)' }}>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <label style={{ fontSize: 13, fontWeight: 700 }}>
                  Formato
                  <select className="select" value={aspect} onChange={(e) => setAspect(e.target.value)} style={{ display: 'block', marginTop: 6 }}>
                    {ASPECTS.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </label>
                <button className="btn-grad" onClick={generar} disabled={!puedeGenerar} style={{ flexGrow: 1, minWidth: 180 }}>
                  {busy ? 'Generando…' : '✨ Generar imagen'}
                </button>
              </div>
              {!busy && personaje.refs.length === 0 ? <p className="sub" style={{ margin: '10px 0 0' }}>Primero subí la cara de tu personaje.</p> : null}
              {statusMsg ? <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--violeta)' }}>{statusMsg}</p> : null}
              {error ? <p className="errbox" style={{ margin: '10px 0 0' }}>{error}</p> : null}
              {(busy || resultUrl) ? (
                <div style={{ marginTop: 14 }}>
                  {busy ? <div className="sub">Generando…</div> : null}
                  {resultUrl ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={resultUrl} alt="resultado" style={{ width: '100%', maxWidth: 340, borderRadius: 14, border: '1px solid var(--line)' }} />
                      <div style={{ fontSize: 13, color: 'var(--ok)', fontWeight: 600, marginTop: 8 }}>✓ Lista y guardada en la Galería.</div>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          </>
        ) : (
          /* ----- GALERÍA ----- */
          <>
            <h1 className="h1" style={{ marginBottom: 4 }}>Mis creaciones</h1>
            <p className="sub" style={{ marginTop: 0, marginBottom: 14 }}>{creaciones.length} en total. Tocá una para verla en grande.</p>
            {upMsg ? <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--violeta)' }}>{upMsg}</p> : null}
            {error ? <p className="errbox" style={{ marginBottom: 12 }}>{error}</p> : null}
            {creaciones.length === 0 ? (
              <div className="panel"><p className="sub" style={{ margin: 0 }}>Todavía no generaste nada. Andá a “Crear”.</p></div>
            ) : (
              <div className="grid-cards">
                {creaciones.map((c) => (
                  <div key={c.id} className="tile" onClick={() => setLightbox(c)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.url} alt="creación" />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div></div>

      {/* Nav inferior (mobile) */}
      <nav className="tabbar">
        <button className={`tab ${vista === 'crear' ? 'on' : ''}`} onClick={() => setVista('crear')}><span className="ti">✨</span>Crear</button>
        <button className={`tab ${vista === 'galeria' ? 'on' : ''}`} onClick={() => setVista('galeria')}><span className="ti">🖼️</span>Galería</button>
        <button className="tab" onClick={salir}><span className="ti">⇽</span>Salir</button>
      </nav>

      {/* ===== MODALES ===== */}
      {abierto === 'personaje' ? (
        <Modal title="Tu personaje" onClose={() => setAbierto(null)}>
          <p className="sub" style={hintS}>La cara que se mantiene igual en todas las fotos (subí 1 a 3).</p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {personaje.refs.map((url) => (
              <div key={url} style={{ position: 'relative' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="cara" style={{ width: 96, height: 120, objectFit: 'cover', borderRadius: 12, border: '1px solid var(--line)' }} />
                <button className="xbtn" onClick={() => quitarCara(url)}>×</button>
              </div>
            ))}
            {personaje.refs.length < 3 ? (
              <label className="upload-tile" style={{ width: 96, height: 120 }}>
                <input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={onSubirCara} style={{ display: 'none' }} />
                <span style={{ fontSize: 24, color: 'var(--rosa)' }}>＋</span>
                <span className="sub" style={{ fontSize: 12, marginTop: 4, textAlign: 'center' }}>{subiendoCara ? 'Subiendo…' : 'Subir foto'}</span>
              </label>
            ) : null}
          </div>
          <label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginTop: 16 }}>
            Nombre (opcional)
            <input className="input" value={personaje.nombre} onChange={(e) => setPersonaje((p) => ({ ...p, nombre: e.target.value }))} onBlur={() => guardarPersonaje(personaje)} placeholder="Ej: Luna" style={{ display: 'block', marginTop: 6, width: 220, maxWidth: '100%' }} />
          </label>
        </Modal>
      ) : null}

      {abierto === 'vestidos' ? (
        <Modal title="Tus vestidos" onClose={() => setAbierto(null)}>
          <p className="sub" style={hintS}>Tocá un vestido para elegirlo. Subí los tuyos con “＋”.</p>
          <GaleriaGrid items={vestidos} sel={vestidoSel} subiendo={subiendoVestido} onUpload={onSubirVestido} onSelect={(id) => setVestidoSel(vestidoSel === id ? null : id)} onDelete={borrarVestido} />
          {vestidos.length === 0 ? <p className="sub" style={{ marginTop: 12 }}>Todavía no cargaste vestidos.</p> : null}
        </Modal>
      ) : null}

      {GALERIAS.filter((g) => abierto === `gal:${g.key}`).map((g) => (
        <Modal key={g.key} title={`${g.emoji} ${g.titulo}`} onClose={() => setAbierto(null)}>
          <p className="sub" style={hintS}>Subí tus fotos de referencia y tocá una para elegirla. Esa imagen se le manda a la IA.</p>
          <GaleriaGrid items={galerias[g.key] ?? []} sel={galSel[g.key] ?? null} subiendo={!!subiendoGal[g.key]} onUpload={(e) => onSubirGaleria(g.key, e)} onSelect={(id) => setGalSel((prev) => ({ ...prev, [g.key]: prev[g.key] === id ? null : id }))} onDelete={(id) => borrarItemGal(g.key, id)} />
          {(galerias[g.key] ?? []).length === 0 ? <p className="sub" style={{ marginTop: 12 }}>Todavía no cargaste fotos acá.</p> : null}
        </Modal>
      ))}

      {abierto === 'extra' ? (
        <Modal title="Detalle extra" onClose={() => setAbierto(null)}>
          <p className="sub" style={hintS}>Escribí cualquier detalle puntual que quieras sumar.</p>
          <textarea className="textarea" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Ej: con un café en la mano, aros dorados…" style={{ height: 110 }} />
        </Modal>
      ) : null}

      {abierto === 'modelo' ? (
        <Modal title="Modelo (motor de imagen)" onClose={() => setAbierto(null)}>
          <p className="sub" style={hintS}>Elegí qué IA genera la imagen. Si una no te convence, probá otra.</p>
          <div style={{ display: 'grid', gap: 10 }}>
            {MODELOS.map((m) => {
              const on = m.id === modelo;
              return (
                <button key={m.id} onClick={() => setModelo(m.id)} style={{ textAlign: 'left', padding: '12px 14px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', border: on ? '2px solid var(--rosa)' : '1px solid var(--line)', background: on ? 'var(--rosa-soft)' : 'var(--surface)', color: 'var(--ink)' }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{m.label}{on ? ' ✓' : ''}</div>
                  <div className="sub">{m.desc}</div>
                </button>
              );
            })}
          </div>
        </Modal>
      ) : null}

      {CATEGORIAS.filter((c) => c.key === abierto).map((cat) => (
        <Modal key={cat.key} title={`${cat.emoji} ${cat.titulo}`} onClose={() => setAbierto(null)}>
          <p className="sub" style={hintS}>Elegí una opción (o ninguna). Tocá de nuevo para quitar.</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {cat.opciones.map((op) => (
              <button key={op.id} className={`opt ${sel[cat.key] === op.id ? 'on' : ''}`} onClick={() => elegirPieza(cat.key, op.id)}>{op.label}</button>
            ))}
          </div>
        </Modal>
      ))}

      {/* ===== LIGHTBOX ===== */}
      {lightbox ? (
        <div className="lb" onClick={() => setLightbox(null)}>
          <div className="lb-top"><button className="lb-x" onClick={() => setLightbox(null)}>×</button></div>
          <div className="lb-img" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lightbox.url} alt="creación" />
          </div>
          <div className="lb-panel" onClick={(e) => e.stopPropagation()}>
            <div className="lb-meta">
              <span>Fecha: <b>{new Date(lightbox.ts).toLocaleDateString()}</b></span>
            </div>
            <div className="lb-row">
              <a className="btn-ghost" href={lightbox.url} target="_blank" rel="noreferrer">⬇ Descargar</a>
              <button className="btn-grad" disabled={!!mejorando} onClick={() => { const c = lightbox; setLightbox(null); setVista('galeria'); if (c) mejorar(c); }}>
                {mejorando ? 'Mejorando…' : '🔎 Mejorar calidad'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

/* ---------- Componentes ---------- */
const hintS: React.CSSProperties = { marginTop: 0, marginBottom: 14 };

function GaleriaGrid(props: {
  items: Item[]; sel: string | null; subiendo: boolean;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSelect: (id: string) => void; onDelete: (id: string) => void;
}) {
  const { items, sel, subiendo, onUpload, onSelect, onDelete } = props;
  return (
    <div className="grid-cards">
      <label className="upload-tile" style={{ aspectRatio: '3 / 4' }}>
        <input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={onUpload} style={{ display: 'none' }} />
        <span style={{ fontSize: 26, color: 'var(--rosa)' }}>＋</span>
        <span className="sub" style={{ fontSize: 12, marginTop: 4 }}>{subiendo ? 'Subiendo…' : 'Subir'}</span>
      </label>
      {items.map((it) => {
        const s = it.id === sel;
        return (
          <div key={it.id} className={`tile ${s ? 'sel' : ''}`} onClick={() => onSelect(it.id)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={it.url} alt="" />
            {s ? <span className="badge">Elegida</span> : null}
            <button className="xbtn" onClick={(ev) => { ev.stopPropagation(); onDelete(it.id); }}>×</button>
          </div>
        );
      })}
    </div>
  );
}

function SectionCard(props: { emoji: string; titulo: string; resumen: string; thumb?: string; dest?: boolean; onClick: () => void }) {
  const { emoji, titulo, resumen, thumb, dest, onClick } = props;
  return (
    <button className={`scard ${dest ? 'dest' : ''}`} onClick={onClick}>
      {thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="th" src={thumb} alt="" />
      ) : (
        <span className="th">{emoji}</span>
      )}
      <div style={{ flexGrow: 1, minWidth: 0 }}>
        <div className="nm">{titulo}</div>
        <div className="sb">{resumen}</div>
      </div>
      <span className="chev">›</span>
    </button>
  );
}

function Modal(props: { title: string; onClose: () => void; children: React.ReactNode }) {
  const { title, onClose, children } = props;
  return (
    <div className="ov" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">{title}</span>
          <button className="modal-x" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-foot"><button className="btn-grad" onClick={onClose}>Listo</button></div>
      </div>
    </div>
  );
}
