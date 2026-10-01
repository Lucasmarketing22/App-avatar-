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

const ASPECTS = ['3:4', '1:1', '4:5', '9:16', '16:9', '4:3'];
const BRIC = "'Bricolage Grotesque', sans-serif";

const C = {
  bg: '#faf8f3', ink: '#211f26', muted: '#6b6772', panel: '#fbfaf7',
  line: '#e7e2d8', purple: '#4f35e8', rose: '#e5397f', roseSoft: '#fbe6ef',
};

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

  const [mejorando, setMejorando] = useState<string | null>(null); // id de la creación en proceso
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
        await Promise.all(
          GALERIAS.map(async (g) => {
            try {
              const d = await fetch(`/api/galeria?tipo=${g.key}`).then((r) => r.json());
              gals[g.key] = Array.isArray(d.items) ? d.items : [];
            } catch {
              gals[g.key] = [];
            }
          }),
        );
        setGalerias(gals);
      } catch {
        /* arranca vacío */
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  const busy = phase === 'creating' || phase === 'polling';
  const vestidoActual = vestidos.find((v) => v.id === vestidoSel) ?? null;
  const puedeGenerar = personaje.refs.length > 0 && !busy;

  function elegirPieza(catKey: string, id: string) {
    setSel((s) => ({ ...s, [catKey]: s[catKey] === id ? undefined : id }));
  }

  async function guardarPersonaje(next: Personaje) {
    setPersonaje(next);
    try {
      await fetch('/api/personaje', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) });
    } catch { /* no bloquea */ }
  }

  async function onSubirCara(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;
    setError(''); setSubiendoCara(true);
    try {
      const libres = Math.max(0, 3 - personaje.refs.length);
      const nuevos: string[] = [];
      for (const f of files.slice(0, libres)) nuevos.push(await subir(f, 'personaje'));
      await guardarPersonaje({ ...personaje, refs: [...personaje.refs, ...nuevos].slice(0, 3) });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir la foto.');
    } finally { setSubiendoCara(false); }
  }

  async function quitarCara(url: string) {
    await guardarPersonaje({ ...personaje, refs: personaje.refs.filter((u) => u !== url) });
  }

  async function onSubirVestido(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;
    setError(''); setSubiendoVestido(true);
    try {
      for (const f of files) {
        const url = await subir(f, 'vestidos');
        const res = await fetch('/api/vestidos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
        const nuevo = (await res.json()) as Item;
        if (res.ok && nuevo?.id) setVestidos((prev) => [nuevo, ...prev]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir el vestido.');
    } finally { setSubiendoVestido(false); }
  }

  async function borrarVestido(id: string) {
    setVestidos((prev) => prev.filter((v) => v.id !== id));
    if (vestidoSel === id) setVestidoSel(null);
    await fetch(`/api/vestidos?id=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => undefined);
  }

  async function onSubirGaleria(tipo: string, e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;
    setError(''); setSubiendoGal((s) => ({ ...s, [tipo]: true }));
    try {
      for (const f of files) {
        const url = await subir(f, tipo);
        const res = await fetch('/api/galeria', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo, url }) });
        const nuevo = (await res.json()) as Item;
        if (res.ok && nuevo?.id) setGalerias((prev) => ({ ...prev, [tipo]: [nuevo, ...(prev[tipo] ?? [])] }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir la imagen.');
    } finally { setSubiendoGal((s) => ({ ...s, [tipo]: false })); }
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
    if (vestidoActual) {
      refs.push({ url: vestidoActual.url, hint: 'Replace her clothing completely with the outfit shown in the outfit reference image, keeping its shape, color, fabric and details faithful.' });
    }
    for (const g of GALERIAS) {
      const id = galSel[g.key];
      const item = (galerias[g.key] ?? []).find((i) => i.id === id);
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
    } catch {
      setError('No se pudo conectar. Probá de nuevo.'); setPhase('error');
    }
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
    if (tries > 40) { setError('La mejora tardó demasiado. Probá de nuevo.'); setMejorando(null); setUpMsg(''); return; }
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
    const selItem = items.find((i) => i.id === galSel[key]);
    return (selItem ?? items[0])?.url;
  }

  return (
    <main style={{ minHeight: '100vh', background: C.bg, color: C.ink }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px 96px' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <div style={{ fontFamily: BRIC, fontWeight: 800, fontSize: 26, letterSpacing: '-0.02em' }}>
            musa<span style={{ color: C.purple }}>.studio</span>
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.rose, background: C.roseSoft, padding: '4px 10px', borderRadius: 999 }}>Estudio</span>
          <div style={{ flexGrow: 1 }} />
          <button type="button" onClick={() => fetch('/api/logout', { method: 'POST' }).then(() => location.reload())} style={btnGhost}>Salir</button>
        </header>

        {cargando ? (
          <p style={{ color: C.muted }}>Cargando tu estudio…</p>
        ) : (
          <>
            <h2 style={{ ...h2, marginBottom: 6 }}>Armá tu creación</h2>
            <p style={{ color: C.muted, fontSize: 13, marginTop: 0, marginBottom: 16 }}>Tocá cada sección para abrirla y elegir. Todo es opcional menos el personaje.</p>

            <div style={{ display: 'grid', gap: 10 }}>
              <SectionCard emoji="📸" titulo="Personaje" resumen={personaje.refs.length ? `${personaje.refs.length} foto${personaje.refs.length > 1 ? 's' : ''}` : 'Subí la cara'} destacado={personaje.refs.length === 0} thumb={personaje.refs[0]} onClick={() => setAbierto('personaje')} />
              <SectionCard emoji="👗" titulo="Vestido" resumen={vestidoActual ? (vestidoActual.nombre || 'Elegido ✓') : vestidos.length ? 'Elegí uno' : 'Subí vestidos'} thumb={vestidoActual?.url} onClick={() => setAbierto('vestidos')} />
              {GALERIAS.map((g) => (
                <SectionCard key={g.key} emoji={g.emoji} titulo={g.titulo} resumen={resumenGaleria(g.key)} thumb={thumbGaleria(g.key)} onClick={() => setAbierto(`gal:${g.key}`)} />
              ))}
              {CATEGORIAS.map((cat) => (
                <SectionCard key={cat.key} emoji={cat.emoji} titulo={cat.titulo} resumen={resumenCategoria(cat.key)} onClick={() => setAbierto(cat.key)} />
              ))}
              <SectionCard emoji="✍️" titulo="Detalle extra" resumen={extra.trim() ? 'Escrito' : 'Opcional'} onClick={() => setAbierto('extra')} />
              <SectionCard emoji="🧠" titulo="Modelo (motor)" resumen={MODELOS.find((m) => m.id === modelo)?.label ?? 'Nano Banana'} onClick={() => setAbierto('modelo')} />
            </div>

            <div style={{ ...panel, marginTop: 20, position: 'sticky', bottom: 12, boxShadow: '0 6px 24px rgba(0,0,0,0.06)' }}>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <label style={{ fontSize: 13, fontWeight: 700 }}>
                  Formato
                  <select value={aspect} onChange={(e) => setAspect(e.target.value)} style={inputBase}>
                    {ASPECTS.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </label>
                <button type="button" onClick={generar} disabled={!puedeGenerar} style={{ ...btnRose, flexGrow: 1, minWidth: 180, opacity: puedeGenerar ? 1 : 0.5, cursor: puedeGenerar ? 'pointer' : 'not-allowed' }}>
                  {busy ? 'Generando…' : '✨ Generar imagen'}
                </button>
              </div>
              {!busy && personaje.refs.length === 0 ? <p style={{ margin: '10px 0 0', fontSize: 13, color: C.muted }}>Primero subí la cara de tu personaje (tocá “Personaje”).</p> : null}
              {statusMsg ? <p style={{ margin: '10px 0 0', fontSize: 13, color: C.purple }}>{statusMsg}</p> : null}
              {error ? <p style={{ margin: '10px 0 0', fontSize: 13, color: '#c0322b', background: '#fbeceb', border: '1px solid #f3cfcb', borderRadius: 10, padding: '8px 10px' }}>{error}</p> : null}
              {(busy || resultUrl) ? (
                <div style={{ marginTop: 14 }}>
                  {busy ? <div style={{ color: C.muted, fontSize: 14 }}>Generando…</div> : null}
                  {resultUrl ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={resultUrl} alt="resultado" style={{ width: '100%', maxWidth: 340, borderRadius: 14, border: `1px solid ${C.line}` }} />
                      <div style={{ fontSize: 13, color: '#1e6b45', fontWeight: 600, marginTop: 8 }}>✓ Lista y guardada en “Mis creaciones”.</div>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>

            {creaciones.length > 0 ? (
              <section style={{ ...panel, marginTop: 20 }}>
                <div style={rowTitle}><h2 style={h2}>Mis creaciones</h2></div>
                {upMsg ? <p style={{ margin: '0 0 10px', fontSize: 13, color: C.purple }}>{upMsg}</p> : null}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12 }}>
                  {creaciones.map((c) => (
                    <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <a href={c.url} target="_blank" rel="noreferrer" style={{ display: 'block', aspectRatio: '3 / 4', borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.line}` }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={c.url} alt="creación" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      </a>
                      <button type="button" onClick={() => mejorar(c)} disabled={!!mejorando} style={{ border: `1px solid ${C.line}`, background: '#fff', borderRadius: 10, padding: '7px 8px', fontSize: 12, fontWeight: 700, cursor: mejorando ? 'default' : 'pointer', fontFamily: 'inherit', color: mejorando === c.id ? C.purple : C.ink, opacity: mejorando && mejorando !== c.id ? 0.5 : 1 }}>
                        {mejorando === c.id ? 'Mejorando…' : '🔎 Mejorar calidad'}
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        )}
      </div>

      {/* ===== VENTANAS ===== */}

      {abierto === 'personaje' ? (
        <Modal title="Tu personaje" onClose={() => setAbierto(null)}>
          <p style={modalHint}>La cara que se mantiene igual en todas las fotos (subí 1 a 3).</p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {personaje.refs.map((url) => (
              <div key={url} style={{ position: 'relative' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="cara" style={{ width: 96, height: 120, objectFit: 'cover', borderRadius: 12, border: `1px solid ${C.line}` }} />
                <button type="button" onClick={() => quitarCara(url)} title="Quitar" style={xBtn}>×</button>
              </div>
            ))}
            {personaje.refs.length < 3 ? (
              <label style={{ ...uploadTile, width: 96, height: 120 }}>
                <input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={onSubirCara} style={{ display: 'none' }} />
                <span style={{ fontSize: 24, color: C.purple }}>＋</span>
                <span style={{ fontSize: 12, color: C.muted, marginTop: 4, textAlign: 'center' }}>{subiendoCara ? 'Subiendo…' : 'Subir foto'}</span>
              </label>
            ) : null}
          </div>
          <label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginTop: 16 }}>
            Nombre (opcional)
            <input value={personaje.nombre} onChange={(e) => setPersonaje((p) => ({ ...p, nombre: e.target.value }))} onBlur={() => guardarPersonaje(personaje)} placeholder="Ej: Luna" style={{ ...inputBase, width: 220, maxWidth: '100%' }} />
          </label>
        </Modal>
      ) : null}

      {abierto === 'vestidos' ? (
        <Modal title="Tus vestidos" onClose={() => setAbierto(null)}>
          <p style={modalHint}>Tocá un vestido para elegirlo. Subí los tuyos con “＋”.</p>
          <GaleriaGrid
            items={vestidos}
            sel={vestidoSel}
            subiendo={subiendoVestido}
            onUpload={onSubirVestido}
            onSelect={(id) => setVestidoSel(vestidoSel === id ? null : id)}
            onDelete={borrarVestido}
          />
          {vestidos.length === 0 ? <p style={{ color: C.muted, fontSize: 13, marginTop: 12 }}>Todavía no cargaste vestidos.</p> : null}
        </Modal>
      ) : null}

      {GALERIAS.filter((g) => abierto === `gal:${g.key}`).map((g) => (
        <Modal key={g.key} title={`${g.emoji} ${g.titulo}`} onClose={() => setAbierto(null)}>
          <p style={modalHint}>Subí tus fotos de referencia y tocá una para elegirla. Esa imagen se le manda a la IA.</p>
          <GaleriaGrid
            items={galerias[g.key] ?? []}
            sel={galSel[g.key] ?? null}
            subiendo={!!subiendoGal[g.key]}
            onUpload={(e) => onSubirGaleria(g.key, e)}
            onSelect={(id) => setGalSel((prev) => ({ ...prev, [g.key]: prev[g.key] === id ? null : id }))}
            onDelete={(id) => borrarItemGal(g.key, id)}
          />
          {(galerias[g.key] ?? []).length === 0 ? <p style={{ color: C.muted, fontSize: 13, marginTop: 12 }}>Todavía no cargaste fotos acá.</p> : null}
        </Modal>
      ))}

      {abierto === 'extra' ? (
        <Modal title="Detalle extra" onClose={() => setAbierto(null)}>
          <p style={modalHint}>Escribí cualquier detalle puntual que quieras sumar.</p>
          <textarea value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Ej: con un café en la mano, aros dorados…" style={{ width: '100%', boxSizing: 'border-box', height: 110, borderRadius: 10, border: `1px solid ${C.line}`, padding: 10, fontSize: 14, fontFamily: 'inherit', resize: 'vertical', background: '#fff' }} />
        </Modal>
      ) : null}

      {abierto === 'modelo' ? (
        <Modal title="Modelo (motor de imagen)" onClose={() => setAbierto(null)}>
          <p style={modalHint}>Elegí qué IA genera la imagen. Si una no te convence, probá otra.</p>
          <div style={{ display: 'grid', gap: 10 }}>
            {MODELOS.map((m) => {
              const activo = m.id === modelo;
              return (
                <button key={m.id} type="button" onClick={() => setModelo(m.id)} style={{ textAlign: 'left', padding: '12px 14px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', border: activo ? `2px solid ${C.rose}` : `1px solid ${C.line}`, background: activo ? C.roseSoft : '#fff', color: C.ink }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{m.label}{activo ? ' ✓' : ''}</div>
                  <div style={{ fontSize: 13, color: C.muted }}>{m.desc}</div>
                </button>
              );
            })}
          </div>
        </Modal>
      ) : null}

      {CATEGORIAS.filter((c) => c.key === abierto).map((cat) => (
        <Modal key={cat.key} title={`${cat.emoji} ${cat.titulo}`} onClose={() => setAbierto(null)}>
          <p style={modalHint}>Elegí una opción (o ninguna). Tocá de nuevo para quitar.</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {cat.opciones.map((op) => {
              const activo = sel[cat.key] === op.id;
              return (
                <button key={op.id} type="button" onClick={() => elegirPieza(cat.key, op.id)} style={{ padding: '10px 16px', borderRadius: 999, fontSize: 14, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', border: activo ? `1.5px solid ${C.rose}` : `1px solid ${C.line}`, background: activo ? C.roseSoft : '#fff', color: activo ? '#a01458' : C.ink }}>
                  {op.label}
                </button>
              );
            })}
          </div>
        </Modal>
      ))}
    </main>
  );
}

/* ---------- Componentes ---------- */

function GaleriaGrid(props: {
  items: Item[]; sel: string | null; subiendo: boolean;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSelect: (id: string) => void; onDelete: (id: string) => void;
}) {
  const { items, sel, subiendo, onUpload, onSelect, onDelete } = props;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10 }}>
      <label style={{ ...uploadTile, aspectRatio: '3 / 4' }}>
        <input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={onUpload} style={{ display: 'none' }} />
        <span style={{ fontSize: 26, color: C.purple }}>＋</span>
        <span style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{subiendo ? 'Subiendo…' : 'Subir'}</span>
      </label>
      {items.map((it) => {
        const s = it.id === sel;
        return (
          <div key={it.id} onClick={() => onSelect(it.id)} style={{ position: 'relative', aspectRatio: '3 / 4', borderRadius: 12, overflow: 'hidden', cursor: 'pointer', border: s ? `3px solid ${C.rose}` : `1px solid ${C.line}` }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={it.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            {s ? <span style={selBadge}>Elegida</span> : null}
            <button type="button" onClick={(ev) => { ev.stopPropagation(); onDelete(it.id); }} title="Borrar" style={xBtn}>×</button>
          </div>
        );
      })}
    </div>
  );
}

function SectionCard(props: { emoji: string; titulo: string; resumen: string; thumb?: string; destacado?: boolean; onClick: () => void }) {
  const { emoji, titulo, resumen, thumb, destacado, onClick } = props;
  return (
    <button type="button" onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', background: C.panel, border: `1px solid ${destacado ? C.rose : C.line}`, borderRadius: 14, padding: '12px 14px', cursor: 'pointer', fontFamily: 'inherit', color: C.ink }}>
      {thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumb} alt="" style={{ width: 40, height: 40, borderRadius: 10, objectFit: 'cover' }} />
      ) : (
        <span style={{ fontSize: 22, width: 40, textAlign: 'center' }}>{emoji}</span>
      )}
      <div style={{ flexGrow: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{titulo}</div>
        <div style={{ fontSize: 13, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{resumen}</div>
      </div>
      <span style={{ color: C.muted, fontSize: 20 }}>›</span>
    </button>
  );
}

function Modal(props: { title: string; onClose: () => void; children: React.ReactNode }) {
  const { title, onClose, children } = props;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 560, maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px', borderBottom: `1px solid ${C.line}` }}>
          <span style={{ fontFamily: BRIC, fontWeight: 800, fontSize: 17 }}>{title}</span>
          <button type="button" onClick={onClose} title="Cerrar" style={{ border: 'none', background: 'transparent', fontSize: 26, lineHeight: 1, cursor: 'pointer', color: C.muted, padding: 0 }}>×</button>
        </div>
        <div style={{ padding: 18, overflowY: 'auto' }}>{children}</div>
        <div style={{ padding: 14, borderTop: `1px solid ${C.line}`, textAlign: 'right' }}>
          <button type="button" onClick={onClose} style={btnRose}>Listo</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Estilos ---------- */
const panel: React.CSSProperties = { background: C.panel, border: `1px solid ${C.line}`, borderRadius: 18, padding: 18 };
const rowTitle: React.CSSProperties = { display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 14 };
const h2: React.CSSProperties = { margin: 0, fontFamily: BRIC, fontWeight: 800, fontSize: 18 };
const btnGhost: React.CSSProperties = { border: `1px solid ${C.line}`, background: '#fff', borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', color: C.ink };
const btnRose: React.CSSProperties = { height: 46, borderRadius: 12, border: 'none', background: C.rose, color: '#fff', fontSize: 15, fontWeight: 700, padding: '0 22px', fontFamily: 'inherit', cursor: 'pointer' };
const uploadTile: React.CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: `2px dashed ${C.line}`, borderRadius: 12, background: '#fff', cursor: 'pointer' };
const xBtn: React.CSSProperties = { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 999, border: 'none', background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 15, lineHeight: '22px', textAlign: 'center', cursor: 'pointer', padding: 0 };
const selBadge: React.CSSProperties = { position: 'absolute', bottom: 6, left: 6, background: C.rose, color: '#fff', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999 };
const inputBase: React.CSSProperties = { display: 'block', marginTop: 6, height: 44, boxSizing: 'border-box', borderRadius: 10, border: `1px solid ${C.line}`, padding: '0 12px', fontSize: 14, fontFamily: 'inherit', background: '#fff' };
const modalHint: React.CSSProperties = { color: C.muted, fontSize: 13, marginTop: 0, marginBottom: 14 };
