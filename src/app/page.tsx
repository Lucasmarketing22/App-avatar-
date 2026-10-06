'use client';

import { useEffect, useRef, useState } from 'react';

import { componerPrompt, componerEditor } from '@/lib/estudio/prompt';
import { CATEGORIAS, type Selecciones } from '@/lib/estudio/piezas';
import { GALERIAS } from '@/lib/estudio/galerias';
import { MODELOS, type ModeloId } from '@/lib/ia/models';

type Personaje = { nombre: string; refs: string[] };
type Item = { id: string; url: string; nombre?: string };
type Creacion = { id: string; url: string; ts: number; prompt?: string; modelo?: string; refs?: string[]; aspect?: string };
type Phase = 'idle' | 'creating' | 'polling' | 'done' | 'error';
type Vista = 'crear' | 'galeria' | 'voz';

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
  const [modelo, setModelo] = useState<ModeloId>('seedream');
  const [crearTab, setCrearTab] = useState<'editor' | 'guiado'>('editor');
  const [editImgs, setEditImgs] = useState<string[]>([]);
  const [editPrompt, setEditPrompt] = useState('');
  const [subiendoEdit, setSubiendoEdit] = useState(false);

  const [aspect, setAspect] = useState('3:4');
  const [cantidad, setCantidad] = useState(2);
  const [phase, setPhase] = useState<Phase>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [error, setError] = useState('');
  const [resultUrls, setResultUrls] = useState<string[]>([]);

  const [subiendoCara, setSubiendoCara] = useState(false);
  const [subiendoVestido, setSubiendoVestido] = useState(false);
  const [subiendoGal, setSubiendoGal] = useState<Record<string, boolean>>({});
  const [cargando, setCargando] = useState(true);

  const [videos, setVideos] = useState<Creacion[]>([]);
  const [galTab, setGalTab] = useState<'fotos' | 'videos'>('fotos');

  const [abierto, setAbierto] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<Creacion | null>(null);
  const [mejorando, setMejorando] = useState<string | null>(null);
  const [upMsg, setUpMsg] = useState('');
  const [motion, setMotion] = useState('');
  const [haciendoVideo, setHaciendoVideo] = useState<string | null>(null);
  const [vidMsg, setVidMsg] = useState('');
  const [copiado, setCopiado] = useState(false);

  const upTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vidTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  function schedulePoll(fn: () => void, ms: number) {
    const id = setTimeout(() => { pollTimers.current.delete(id); fn(); }, ms);
    pollTimers.current.add(id);
  }
  useEffect(() => () => {
    pollTimers.current.forEach(clearTimeout);
    if (upTimer.current) clearTimeout(upTimer.current);
    if (vidTimer.current) clearTimeout(vidTimer.current);
  }, []);

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
        try { const vd = await fetch('/api/videos').then((r) => r.json()); if (Array.isArray(vd.items)) setVideos(vd.items); } catch { /* */ }
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

  type GenMeta = { aspect: string; modelo: ModeloId };

  /** Lanza N generaciones en paralelo (una por cada "cantidad") y las va mostrando. */
  async function lanzar(prompt: string, imageUrls: string[], meta: GenMeta) {
    setAbierto(null); setError(''); setResultUrls([]);
    pollTimers.current.forEach(clearTimeout); pollTimers.current.clear();
    setPhase('creating'); setStatusMsg('Enviando el pedido a la IA…');
    const n = Math.max(1, Math.min(4, cantidad));
    const taskIds: string[] = [];
    let ultimoError = '';
    for (let i = 0; i < n; i++) {
      try {
        const res = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, imageUrls, aspect: meta.aspect, modelo: meta.modelo }) });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.taskId) taskIds.push(data.taskId);
        else ultimoError = data.error ?? 'No se pudo crear la generación.';
      } catch { ultimoError = 'No se pudo conectar. Probá de nuevo.'; }
    }
    if (!taskIds.length) { setError(ultimoError || 'No se pudo crear la generación.'); setPhase('error'); return; }
    setPhase('polling'); setStatusMsg(`Generando ${taskIds.length} ${taskIds.length > 1 ? 'opciones' : 'imagen'}… (puede tardar ~1 minuto)`);
    let remaining = taskIds.length;
    let gotAny = false;
    const finishOne = (ok: boolean) => {
      if (ok) gotAny = true;
      remaining -= 1;
      if (remaining <= 0) { setPhase('done'); setStatusMsg(''); if (!gotAny) setError((p) => p || 'No salió ninguna imagen. Probá de nuevo.'); }
    };
    taskIds.forEach((id) => pollOne(id, 0, prompt, imageUrls, meta, finishOne));
  }

  function pollOne(taskId: string, tries: number, prompt: string, imageUrls: string[], meta: GenMeta, done: (ok: boolean) => void) {
    if (tries > 40) { done(false); return; }
    schedulePoll(async () => {
      try {
        const res = await fetch(`/api/status?taskId=${encodeURIComponent(taskId)}`);
        const data = await res.json().catch(() => ({}));
        if (data.state === 'success') {
          const u = data.url as string | undefined;
          if (u) {
            setResultUrls((prev) => (prev.includes(u) ? prev : [...prev, u]));
            setCreaciones((prev) => [{ id: u, url: u, ts: Date.now(), prompt, modelo: meta.modelo, refs: imageUrls, aspect: meta.aspect }, ...prev.filter((c) => c.url !== u)]);
            fetch('/api/meta', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: u, prompt, modelo: meta.modelo, refs: imageUrls, aspect: meta.aspect }) }).catch(() => undefined);
          }
          done(!!u); return;
        }
        if (data.state === 'fail' || (!res.ok && data.error)) { done(false); return; }
        pollOne(taskId, tries + 1, prompt, imageUrls, meta, done);
      } catch { pollOne(taskId, tries + 1, prompt, imageUrls, meta, done); }
    }, 3000);
  }

  async function generar() {
    if (!puedeGenerar) return;
    const refs: { url: string; hint: string }[] = [];
    if (vestidoActual) refs.push({ url: vestidoActual.url, hint: 'Replace her clothing completely with the outfit shown in the outfit reference image, keeping its shape, color, fabric and details faithful.' });
    for (const g of GALERIAS) {
      const item = (galerias[g.key] ?? []).find((i) => i.id === galSel[g.key]);
      if (item) refs.push({ url: item.url, hint: g.hint });
    }
    const imageUrls = [...personaje.refs, ...refs.map((r) => r.url)];
    const prompt = componerPrompt({ hints: refs.map((r) => r.hint), selecciones: sel, extra });
    lanzar(prompt, imageUrls, { aspect, modelo });
  }

  /** Repetir / variar: reusa el prompt y las referencias exactas de una creación. */
  function variar(c: Creacion) {
    if (busy) return;
    if (!c.prompt || !c.refs || !c.refs.length) { setError('Esta foto es vieja y no guardó sus datos. Hacela de nuevo desde el Editor.'); return; }
    const m = (c.modelo as ModeloId) || modelo;
    const a = c.aspect || aspect;
    setLightbox(null); setVista('crear'); setModelo(m); setAspect(a);
    lanzar(c.prompt, c.refs, { aspect: a, modelo: m });
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

  async function onSubirEdit(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []); e.target.value = '';
    if (!files.length) return;
    setError(''); setSubiendoEdit(true);
    try {
      const libres = Math.max(0, 6 - editImgs.length);
      const nuevos: string[] = [];
      for (const f of files.slice(0, libres)) nuevos.push(await subir(f, 'refs'));
      setEditImgs((prev) => [...prev, ...nuevos].slice(0, 6));
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo subir la imagen.'); } finally { setSubiendoEdit(false); }
  }
  function quitarEdit(url: string) { setEditImgs((prev) => prev.filter((u) => u !== url)); }

  async function generarEditor() {
    if (!editImgs.length || busy) return;
    const prompt = componerEditor(editPrompt, editImgs.length);
    lanzar(prompt, editImgs, { aspect, modelo });
  }

  async function crearVideo(c: Creacion) {
    if (haciendoVideo) return;
    setError(''); setHaciendoVideo(c.id); setVidMsg('Creando el video… (Veo tarda 1 a 4 minutos, no cierres)');
    try {
      const res = await fetch('/api/video', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageUrls: [c.url], prompt: motion.trim() || undefined, aspect: '9:16' }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.taskId) { setError(data.error ?? 'No se pudo crear el video.'); setHaciendoVideo(null); setVidMsg(''); return; }
      pollVideo(data.taskId, 0);
    } catch { setError('No se pudo conectar.'); setHaciendoVideo(null); setVidMsg(''); }
  }
  function pollVideo(taskId: string, tries: number) {
    if (tries > 90) { setError('El video tardó demasiado. Probá de nuevo.'); setHaciendoVideo(null); setVidMsg(''); return; }
    vidTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/status?taskId=${encodeURIComponent(taskId)}`);
        const data = await res.json().catch(() => ({}));
        if (data.state === 'success') {
          if (data.url) setVideos((prev) => [{ id: data.url as string, url: data.url as string, ts: Date.now() }, ...prev.filter((x) => x.url !== data.url)]);
          setHaciendoVideo(null); setVidMsg(''); setVista('galeria'); setGalTab('videos');
          return;
        }
        if (data.state === 'fail' || (!res.ok && data.error)) { setError(data.error ?? 'El video falló.'); setHaciendoVideo(null); setVidMsg(''); return; }
        pollVideo(taskId, tries + 1);
      } catch { pollVideo(taskId, tries + 1); }
    }, 3000);
  }

  async function borrarCreacion(c: Creacion) {
    if (typeof window !== 'undefined' && !window.confirm('¿Eliminar esta foto? No se puede deshacer.')) return;
    setLightbox(null);
    setCreaciones((prev) => prev.filter((x) => x.id !== c.id));
    setResultUrls((prev) => prev.filter((x) => x !== c.url));
    try { await fetch(`/api/creaciones?url=${encodeURIComponent(c.url)}`, { method: 'DELETE' }); } catch { /* */ }
  }
  async function borrarVideo(v: Creacion) {
    if (typeof window !== 'undefined' && !window.confirm('¿Eliminar este video? No se puede deshacer.')) return;
    setVideos((prev) => prev.filter((x) => x.id !== v.id));
    try { await fetch(`/api/videos?url=${encodeURIComponent(v.url)}`, { method: 'DELETE' }); } catch { /* */ }
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

  function openResult(u: string) {
    setMotion('');
    const c = creaciones.find((x) => x.url === u);
    setLightbox(c ?? { id: u, url: u, ts: Date.now() });
  }

  // Bloque de resultados (varias opciones). Se usa en Editor y en Guiado.
  const resultBlock = (busy || resultUrls.length) ? (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8 }}>
        <span style={{ fontSize: 13, color: (!busy && resultUrls.length) ? 'var(--ok)' : 'var(--violeta)', fontWeight: 600 }}>
          {busy ? `Generando… ${resultUrls.length}/${cantidad}` : `✓ ${resultUrls.length} guardada${resultUrls.length > 1 ? 's' : ''} en la Galería. Tocá para ver, 🗑️ para descartar.`}
        </span>
        {!busy ? <button className="btn-soft" onClick={() => { setResultUrls([]); setPhase('idle'); }}>✕ Cerrar</button> : null}
      </div>
      <div className="grid-cards">
        {resultUrls.map((u) => (
          <div key={u} className="tile result-pop" onClick={() => openResult(u)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={u} alt="resultado" />
            <button className="xbtn" title="Descartar" onClick={(e) => { e.stopPropagation(); const c = creaciones.find((x) => x.url === u) ?? { id: u, url: u, ts: Date.now() }; borrarCreacion(c); }}>🗑️</button>
          </div>
        ))}
        {busy ? Array.from({ length: Math.max(0, cantidad - resultUrls.length) }).map((_, i) => (
          <div key={`sk${i}`} className="tile"><div style={{ width: '100%', height: '100%', background: 'linear-gradient(100deg,#efe7ec 30%,#f8f1f5 50%,#efe7ec 70%)', backgroundSize: '220% 100%', animation: 'sk 1.15s linear infinite' }} /></div>
        )) : null}
      </div>
    </div>
  ) : null;

  return (
    <main className="app-bg">
      {/* Barra lateral (desktop) */}
      <aside className="rail">
        <div className="rail-logo">m</div>
        <button className={`rail-ic ${vista === 'crear' ? 'on' : ''}`} onClick={() => setVista('crear')}><Icon name="sparkles" /><span>Crear</span></button>
        <button className={`rail-ic ${vista === 'galeria' ? 'on' : ''}`} onClick={() => setVista('galeria')}><Icon name="galeria" /><span>Galería</span></button>
        <button className={`rail-ic ${vista === 'voz' ? 'on' : ''}`} onClick={() => setVista('voz')}><Icon name="voz" /><span>Voz</span></button>
        <div className="rail-spacer" />
        <button className="rail-ic" onClick={salir}><Icon name="salir" /><span>Salir</span></button>
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
          <div className="crear2">
            <div className="crear2-side">
            <h1 className="h1" style={{ marginBottom: 10 }}>Armá tu creación</h1>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              <button className={`opt ${crearTab === 'editor' ? 'on' : ''}`} onClick={() => setCrearTab('editor')}>🧩 Editor</button>
              <button className={`opt ${crearTab === 'guiado' ? 'on' : ''}`} onClick={() => setCrearTab('guiado')}>🎛️ Guiado</button>
            </div>

            {crearTab === 'editor' ? (
              <>
                <div className="panel rise" style={{ marginBottom: 16 }}>
                  <div className="h2" style={{ marginBottom: 6 }}>Imágenes de referencia</div>
                  <p className="sub" style={{ marginTop: 0, marginBottom: 12 }}>
                    Subí tus imágenes y nombralas en el texto como <b>imagen 1</b>, <b>imagen 2</b>…<br />
                    <b style={{ color: 'var(--rosa-strong)' }}>Regla de oro:</b> <b>Imagen 1</b> = la pose/escena que querés · <b>Imagen 2</b> = la cara de tu modelo.
                  </p>
                  <div className="grid-cards">
                    {editImgs.map((u, i) => (
                      <div key={u} className="tile" style={{ cursor: 'default' }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={u} alt="" />
                        <span className="badge">imagen {i + 1}</span>
                        <button className="xbtn" onClick={() => quitarEdit(u)}>×</button>
                      </div>
                    ))}
                    {editImgs.length < 6 ? (
                      <label className="upload-tile" style={{ aspectRatio: '3 / 4' }}>
                        <input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={onSubirEdit} style={{ display: 'none' }} />
                        <span style={{ fontSize: 26, color: 'var(--rosa)' }}>＋</span>
                        <span className="sub" style={{ fontSize: 12, marginTop: 4 }}>{subiendoEdit ? 'Subiendo…' : 'Subir'}</span>
                      </label>
                    ) : null}
                  </div>

                  <label style={{ display: 'block', marginTop: 16, fontSize: 13, fontWeight: 700 }}>
                    Qué querés hacer
                    <textarea className="textarea" style={{ height: 120, marginTop: 6 }} value={editPrompt} onChange={(e) => setEditPrompt(e.target.value)} placeholder="Describí lo que querés CREAR. Ej: La misma mujer de las imágenes, en bikini rojo en la playa al atardecer, pose sensual natural, foto realista de celular. — O si querés clonar una foto y solo cambiar la cara, usá el botón de abajo." />
                  </label>
                  <button className="btn-ghost" style={{ marginTop: 8 }} onClick={() => setEditPrompt('Recreá la imagen 1 tal cual (misma escena, fondo, pose, luz y encuadre). La chica debe ser la de la imagen 2 (misma cara e identidad). Mantené el mismo vestuario y escenario de la imagen 1.')}>📸 Clonar foto + cambiar cara</button>

                  <div style={{ marginTop: 14, background: 'var(--violeta-soft)', borderRadius: 'var(--r-md)', padding: '12px 14px', fontSize: 13 }}>
                    💡 <b>Dos formas de usarlo:</b><br />
                    <b>1) Crear algo nuevo:</b> describí la escena que querés (ej: “la misma mujer, en bikini en la playa”). La IA la crea y mantiene su cara. Para bikini/sensual usá <b>Seedream 4.5</b> o <b>Flux 2 Pro</b> (Nano bloquea bikini).<br />
                    <b>2) Clonar foto (realista como Flow):</b> poné una <b>foto real</b> como <b>imagen 1</b> y la <b>cara</b> como <b>imagen 2</b>, y tocá “📸 Clonar foto + cambiar cara”.
                  </div>
                </div>

                <div className="panel" style={{ marginTop: 16, boxShadow: 'var(--sh-md)' }}>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <label style={{ fontSize: 13, fontWeight: 700 }}>Formato
                      <select className="select" value={aspect} onChange={(e) => setAspect(e.target.value)} style={{ display: 'block', marginTop: 6 }}>
                        {ASPECTS.map((a) => <option key={a} value={a}>{a}</option>)}
                      </select>
                    </label>
                    <label style={{ fontSize: 13, fontWeight: 700 }}>Modelo
                      <select className="select" value={modelo} onChange={(e) => setModelo(e.target.value as ModeloId)} style={{ display: 'block', marginTop: 6 }}>
                        {MODELOS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                      </select>
                    </label>
                    <label style={{ fontSize: 13, fontWeight: 700 }}>Cantidad
                      <select className="select" value={cantidad} onChange={(e) => setCantidad(Number(e.target.value))} style={{ display: 'block', marginTop: 6 }}>
                        {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </label>
                    <button className={`btn-grad shine ${busy ? 'busy' : ''}`} onClick={generarEditor} disabled={!editImgs.length || busy} style={{ flexGrow: 1, minWidth: 160 }}>
                      {busy ? 'Generando…' : '✨ Generar'}
                    </button>
                  </div>
                  {!busy && !editImgs.length ? <p className="sub" style={{ margin: '10px 0 0' }}>Subí al menos una imagen de referencia.</p> : null}
                  {statusMsg ? <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--violeta)' }}>{statusMsg}</p> : null}
                  {error ? <p className="errbox" style={{ margin: '10px 0 0' }}>{error}</p> : null}
                </div>
              </>
            ) : (
              <>
                <p className="sub" style={{ marginTop: 0, marginBottom: 16 }}>Elegí por secciones. Todo es opcional menos el personaje.</p>
                <div className="stagger" style={{ display: 'grid', gap: 10 }}>
                  <SectionCard icon="user" titulo="Personaje" resumen={personaje.refs.length ? `${personaje.refs.length} foto${personaje.refs.length > 1 ? 's' : ''}` : 'Subí la cara'} dest={personaje.refs.length === 0} thumb={personaje.refs[0]} onClick={() => setAbierto('personaje')} />
                  <SectionCard icon="shirt" titulo="Vestido" resumen={vestidoActual ? (vestidoActual.nombre || 'Elegido ✓') : vestidos.length ? 'Elegí uno' : 'Subí vestidos'} thumb={vestidoActual?.url} onClick={() => setAbierto('vestidos')} />
                  {GALERIAS.map((g) => (
                    <SectionCard key={g.key} icon={ICONO[g.key] ?? 'image'} titulo={g.titulo} resumen={resumenGaleria(g.key)} thumb={thumbGaleria(g.key)} onClick={() => setAbierto(`gal:${g.key}`)} />
                  ))}
                  {CATEGORIAS.map((cat) => (
                    <SectionCard key={cat.key} icon={ICONO[cat.key] ?? 'palette'} titulo={cat.titulo} resumen={resumenCategoria(cat.key)} onClick={() => setAbierto(cat.key)} />
                  ))}
                  <SectionCard icon="pencil" titulo="Detalle extra" resumen={extra.trim() ? 'Escrito' : 'Opcional'} onClick={() => setAbierto('extra')} />
                  <SectionCard icon="chip" titulo="Modelo (motor)" resumen={modeloLabel} onClick={() => setAbierto('modelo')} />
                </div>
                <div className="panel" style={{ marginTop: 20, boxShadow: 'var(--sh-md)' }}>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <label style={{ fontSize: 13, fontWeight: 700 }}>Formato
                      <select className="select" value={aspect} onChange={(e) => setAspect(e.target.value)} style={{ display: 'block', marginTop: 6 }}>
                        {ASPECTS.map((a) => <option key={a} value={a}>{a}</option>)}
                      </select>
                    </label>
                    <label style={{ fontSize: 13, fontWeight: 700 }}>Cantidad
                      <select className="select" value={cantidad} onChange={(e) => setCantidad(Number(e.target.value))} style={{ display: 'block', marginTop: 6 }}>
                        {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </label>
                    <button className={`btn-grad shine ${busy ? 'busy' : ''}`} onClick={generar} disabled={!puedeGenerar} style={{ flexGrow: 1, minWidth: 180 }}>
                      {busy ? 'Generando…' : '✨ Generar imagen'}
                    </button>
                  </div>
                  {!busy && personaje.refs.length === 0 ? <p className="sub" style={{ margin: '10px 0 0' }}>Primero subí la cara de tu personaje.</p> : null}
                  {statusMsg ? <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--violeta)' }}>{statusMsg}</p> : null}
                  {error ? <p className="errbox" style={{ margin: '10px 0 0' }}>{error}</p> : null}
                </div>
              </>
            )}
            </div>
            <div className="crear2-main">
              {resultBlock || (
                <div className="preview-empty">
                  <div className="big">✨</div>
                  <div style={{ fontWeight: 700, color: 'var(--ink)' }}>Acá van a aparecer tus creaciones</div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>Armá a la izquierda y tocá Generar.</div>
                </div>
              )}
            </div>
          </div>
        ) : vista === 'voz' ? (
          <>
            <h1 className="h1" style={{ marginBottom: 10 }}>Voz de tu modelo</h1>
            <div className="panel">
              <p className="sub" style={{ marginTop: 0 }}>Pronto vas a poder darle una <b>voz propia</b> a tu modelo: generar audios con el texto que escribas y elegir o clonar su voz.</p>
              <p className="sub" style={{ marginBottom: 0 }}>Estamos integrando <b>Fish Audio</b>. En cuanto cargues la clave, se activa esta sección. 🎙️</p>
            </div>
          </>
        ) : (
          /* ----- GALERÍA ----- */
          <>
            <h1 className="h1" style={{ marginBottom: 10 }}>Mis creaciones</h1>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <button className={`opt ${galTab === 'fotos' ? 'on' : ''}`} onClick={() => setGalTab('fotos')}>🖼️ Fotos ({creaciones.length})</button>
              <button className={`opt ${galTab === 'videos' ? 'on' : ''}`} onClick={() => setGalTab('videos')}>🎬 Videos ({videos.length})</button>
            </div>
            {upMsg ? <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--violeta)' }}>{upMsg}</p> : null}
            {vidMsg ? <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--violeta)' }}>{vidMsg}</p> : null}
            {error ? <p className="errbox" style={{ marginBottom: 12 }}>{error}</p> : null}

            {galTab === 'fotos' ? (
              creaciones.length === 0 ? (
                <div className="panel"><p className="sub" style={{ margin: 0 }}>Todavía no generaste fotos. Andá a “Crear”.</p></div>
              ) : (
                <div className="grid-cards stagger">
                  {creaciones.map((c) => (
                    <div key={c.id} className="tile" onClick={() => { setMotion(''); setLightbox(c); }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={c.url} alt="creación" />
                      <button className="xbtn" title="Eliminar" onClick={(e) => { e.stopPropagation(); borrarCreacion(c); }}>🗑️</button>
                    </div>
                  ))}
                </div>
              )
            ) : (
              videos.length === 0 ? (
                <div className="panel"><p className="sub" style={{ margin: 0 }}>Todavía no hay videos. Abrí una foto y tocá “🎬 Crear video”.</p></div>
              ) : (
                <div className="grid-cards stagger">
                  {videos.map((v) => (
                    <div key={v.id} className="tile" style={{ cursor: 'default' }}>
                      <video src={v.url} controls playsInline preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      <button className="xbtn" title="Eliminar" onClick={() => borrarVideo(v)}>🗑️</button>
                    </div>
                  ))}
                </div>
              )
            )}
          </>
        )}
      </div></div>

      {/* Nav inferior (mobile) */}
      <nav className="tabbar">
        <button className={`tab ${vista === 'crear' ? 'on' : ''}`} onClick={() => setVista('crear')}><span className="ti"><Icon name="sparkles" /></span>Crear</button>
        <button className={`tab ${vista === 'galeria' ? 'on' : ''}`} onClick={() => setVista('galeria')}><span className="ti"><Icon name="galeria" /></span>Galería</button>
        <button className={`tab ${vista === 'voz' ? 'on' : ''}`} onClick={() => setVista('voz')}><span className="ti"><Icon name="voz" /></span>Voz</button>
        <button className="tab" onClick={salir}><span className="ti"><Icon name="salir" /></span>Salir</button>
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
              {lightbox.modelo ? <span>Modelo: <b>{MODELOS.find((m) => m.id === lightbox.modelo)?.label ?? lightbox.modelo}</b></span> : null}
            </div>
            {lightbox.prompt ? (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: 'var(--muted)', marginBottom: 4 }}>PROMPT</div>
                <div style={{ fontSize: 12.5, color: 'var(--ink)', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 10, padding: '8px 10px', maxHeight: 130, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>{lightbox.prompt}</div>
                <button className="btn-soft" style={{ marginTop: 6 }} onClick={() => { navigator.clipboard?.writeText(lightbox.prompt || ''); setCopiado(true); setTimeout(() => setCopiado(false), 1500); }}>
                  {copiado ? '¡Copiado! ✓' : '📋 Copiar prompt'}
                </button>
              </div>
            ) : null}
            <div className="lb-row">
              <a className="btn-ghost" href={lightbox.url} target="_blank" rel="noreferrer">⬇ Descargar</a>
              <button className="btn-ghost" disabled={!!mejorando} onClick={() => { const c = lightbox; setLightbox(null); setVista('galeria'); setGalTab('fotos'); if (c) mejorar(c); }}>
                {mejorando ? 'Mejorando…' : '🔎 Mejorar'}
              </button>
            </div>
            {lightbox.prompt && lightbox.refs && lightbox.refs.length ? (
              <button className="btn-grad shine" disabled={busy} style={{ width: '100%', marginTop: 10 }} onClick={() => { const c = lightbox; if (c) variar(c); }}>
                {busy ? 'Generando…' : '🔁 Repetir / Variar (crear parecidas)'}
              </button>
            ) : null}
            <div style={{ marginTop: 12 }}>
              <input className="input" value={motion} onChange={(e) => setMotion(e.target.value)} placeholder="Movimiento (opcional): ej. camina y sonríe" style={{ width: '100%', boxSizing: 'border-box' }} />
              <button className="btn-grad" disabled={!!haciendoVideo} style={{ width: '100%', marginTop: 8 }} onClick={() => { const c = lightbox; setLightbox(null); if (c) crearVideo(c); }}>
                {haciendoVideo ? 'Creando video…' : '🎬 Crear video'}
              </button>
              <p className="sub" style={{ margin: '8px 0 0', fontSize: 12 }}>El video (Veo 3.1) tarda 1–4 min y gasta más crédito que una foto.</p>
            </div>
            <button
              className="btn-ghost"
              style={{ width: '100%', marginTop: 14, color: 'var(--err)', borderColor: '#f3cfcb' }}
              onClick={() => { const c = lightbox; if (c) borrarCreacion(c); }}
            >
              🗑️ Eliminar esta foto
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}

/* ---------- Iconos propios (SVG línea) ---------- */
const ICONO: Record<string, string> = {
  personaje: 'user', vestido: 'shirt', peinados: 'scissors', poses: 'pose', escenas: 'image', cine: 'film',
  expresion: 'smile', luz: 'sun', estilo: 'palette', encuadre: 'crop', extra: 'pencil', modelo: 'chip',
};

function Icon({ name }: { name?: string }) {
  const p: Record<string, React.ReactNode> = {
    sparkles: <><path d="M12 3l1.8 4.6L18.5 9.4 13.8 11.2 12 16l-1.8-4.8L5.5 9.4l4.7-1.8z" /><path d="M19 15l.7 1.8 1.8.7-1.8.7L19 20l-.7-1.8L16.5 17.5l1.8-.7z" /></>,
    galeria: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="M21 16l-5-5L5 20" /></>,
    image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="M21 16l-5-5L5 20" /></>,
    voz: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0" /><path d="M12 18v3" /><path d="M8 21h8" /></>,
    salir: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
    shirt: <path d="M16 3l5 3-2 4-2-1v11H7V9L5 10 3 6l5-3 2 2a2 2 0 0 0 4 0z" />,
    scissors: <><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M20 4L8.1 15.9" /><path d="M14.5 14.5L20 20" /><path d="M8.1 8.1L12 12" /></>,
    pose: <><circle cx="12" cy="4.5" r="2" /><path d="M12 6.5v6" /><path d="M8 9.5l4-1 4 1" /><path d="M9 21l3-6 3 6" /></>,
    film: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4" /></>,
    smile: <><circle cx="12" cy="12" r="9" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><path d="M9 9h.01M15 9h.01" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
    palette: <><path d="M12 2a10 10 0 1 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-.9-.5-1.3-.3-.4-.5-.8-.5-1.2 0-.8.7-1.5 1.5-1.5H17a4 4 0 0 0 4-4c0-5-4-9-9-9z" /><circle cx="7.5" cy="10.5" r="1" /><circle cx="12" cy="7.5" r="1" /><circle cx="16.5" cy="10.5" r="1" /></>,
    crop: <><path d="M6 2v14a2 2 0 0 0 2 2h14" /><path d="M2 6h14a2 2 0 0 1 2 2v14" /></>,
    pencil: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
    chip: <><rect x="6" y="6" width="12" height="12" rx="2" /><path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2" /></>,
  };
  return <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">{p[name ?? 'image'] ?? p.image}</svg>;
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

function SectionCard(props: { icon?: string; titulo: string; resumen: string; thumb?: string; dest?: boolean; onClick: () => void }) {
  const { icon, titulo, resumen, thumb, dest, onClick } = props;
  return (
    <button className={`scard ${dest ? 'dest' : ''}`} onClick={onClick}>
      {thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="th" src={thumb} alt="" />
      ) : (
        <span className="th"><Icon name={icon} /></span>
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
