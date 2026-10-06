'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';

import { componerUnificado } from '@/lib/estudio/prompt';
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

  // ----- Voz (Fish Audio) -----
  const [vozCargada, setVozCargada] = useState(false);
  const [vozKey, setVozKey] = useState(true);
  const [vozRef, setVozRef] = useState('');
  const [vozNombre, setVozNombre] = useState('');
  const [vozItems, setVozItems] = useState<Creacion[]>([]);
  const [vozText, setVozText] = useState('');
  const [vozGen, setVozGen] = useState(false);
  const [vozMsg, setVozMsg] = useState('');
  const [vozErr, setVozErr] = useState('');
  const [vozGuardado, setVozGuardado] = useState(false);

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

  // Carga la sección de voz la primera vez que se abre.
  useEffect(() => {
    if (vista !== 'voz' || vozCargada) return;
    (async () => {
      try {
        const d = await fetch('/api/voz').then((r) => r.json());
        setVozKey(!!d.configured);
        setVozRef(d.voz?.reference_id ?? '');
        setVozNombre(d.voz?.nombre ?? '');
        if (Array.isArray(d.items)) setVozItems(d.items);
      } catch { /* */ } finally { setVozCargada(true); }
    })();
  }, [vista, vozCargada]);

  const busy = phase === 'creating' || phase === 'polling';
  const vestidoActual = vestidos.find((v) => v.id === vestidoSel) ?? null;
  const puedeCrear = (personaje.refs.length > 0 || editImgs.length > 0) && !busy;
  const previewActual: Creacion | null = resultUrls.length
    ? (creaciones.find((c) => c.url === resultUrls[0]) ?? { id: resultUrls[0], url: resultUrls[0], ts: Date.now() })
    : (creaciones[0] ?? null);
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

  /** Generar unificado (estilo Aria): junta personaje + piezas + referencias + prompt. */
  async function generarUnificado() {
    if (busy) return;
    const refsExtra: { url: string; hint: string }[] = [];
    if (vestidoActual) refsExtra.push({ url: vestidoActual.url, hint: 'One reference image shows an outfit; dress her in that exact outfit, keeping its shape, color, fabric and details.' });
    for (const g of GALERIAS) {
      const item = (galerias[g.key] ?? []).find((i) => i.id === galSel[g.key]);
      if (item) refsExtra.push({ url: item.url, hint: g.hint });
    }
    const imageUrls = [...editImgs, ...personaje.refs, ...refsExtra.map((r) => r.url)];
    if (!imageUrls.length) { setError('Subí al menos una imagen: el personaje (cara) o una referencia.'); setPhase('error'); return; }
    const faceHint = personaje.refs.length ? ["One or more reference images show the woman's face and identity; keep her face exactly."] : [];
    const hints = [...faceHint, ...refsExtra.map((r) => r.hint)];
    const texto = [editPrompt.trim(), extra.trim()].filter(Boolean).join('. ');
    const prompt = componerUnificado({ texto, nRefs: editImgs.length, hints, selecciones: sel });
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

  async function guardarVoz() {
    setVozErr('');
    try {
      const res = await fetch('/api/voz', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reference_id: vozRef.trim(), nombre: vozNombre.trim() }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setVozErr(d.error ?? 'No se pudo guardar.'); return; }
      setVozGuardado(true); setTimeout(() => setVozGuardado(false), 1500);
    } catch { setVozErr('No se pudo conectar.'); }
  }
  async function generarVoz() {
    if (vozGen || !vozText.trim()) return;
    setVozErr(''); setVozGen(true); setVozMsg('Generando la voz… (unos segundos)');
    try {
      const res = await fetch('/api/voz', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: vozText.trim() }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.url) { setVozErr(d.error ?? 'No se pudo generar.'); setVozGen(false); setVozMsg(''); return; }
      setVozItems((prev) => [{ id: d.url as string, url: d.url as string, ts: Date.now() }, ...prev]);
      setVozGen(false); setVozMsg('');
    } catch { setVozErr('No se pudo conectar.'); setVozGen(false); setVozMsg(''); }
  }
  async function borrarAudio(a: Creacion) {
    if (typeof window !== 'undefined' && !window.confirm('¿Eliminar este audio?')) return;
    setVozItems((prev) => prev.filter((x) => x.id !== a.id));
    try { await fetch(`/api/voz?url=${encodeURIComponent(a.url)}`, { method: 'DELETE' }); } catch { /* */ }
  }

  const salir = () => fetch('/api/logout', { method: 'POST' }).then(() => location.reload());

  function openResult(u: string) {
    setMotion('');
    const c = creaciones.find((x) => x.url === u);
    setLightbox(c ?? { id: u, url: u, ts: Date.now() });
  }

  return (
    <main className="app-bg">
      {/* Barra lateral (desktop) */}
      <aside className="rail">
        <div className="rail-logo">m</div>
        <button className={`rail-ic ${vista === 'crear' ? 'on' : ''}`} onClick={() => setVista('crear')}><Icon name="sparkles" /><span>Crear</span></button>
        <button className={`rail-ic ${vista === 'galeria' ? 'on' : ''}`} onClick={() => setVista('galeria')}><Icon name="galeria" /><span>Galería</span></button>
        <button className={`rail-ic ${vista === 'voz' ? 'on' : ''}`} onClick={() => setVista('voz')}><Icon name="voz" /><span>Voz</span></button>
        <div className="rail-sep" />
        <button className="rail-ic" onClick={() => { setVista('crear'); setAbierto('personaje'); }} title="Personaje"><Icon name="user" /><span>Personaje</span></button>
        <button className="rail-ic" onClick={() => { setVista('crear'); setAbierto('vestidos'); }} title="Vestido"><Icon name="shirt" /><span>Vestido</span></button>
        {GALERIAS.map((g) => (
          <button key={g.key} className="rail-ic" onClick={() => { setVista('crear'); setAbierto(`gal:${g.key}`); }} title={g.titulo}><Icon name={ICONO[g.key] ?? 'image'} /><span>{RAIL_LABEL[g.key] ?? g.titulo}</span></button>
        ))}
        {CATEGORIAS.map((cat) => (
          <button key={cat.key} className="rail-ic" onClick={() => { setVista('crear'); setAbierto(cat.key); }} title={cat.titulo}><Icon name={ICONO[cat.key] ?? 'palette'} /><span>{RAIL_LABEL[cat.key] ?? cat.titulo}</span></button>
        ))}
        <button className="rail-ic" onClick={() => { setVista('crear'); setAbierto('extra'); }} title="Detalle"><Icon name="pencil" /><span>Detalle</span></button>
        <button className="rail-ic" onClick={() => { setVista('crear'); setAbierto('modelo'); }} title="Modelo"><Icon name="chip" /><span>Modelo</span></button>
        <div className="rail-sep" />
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
          <div className="aria">
            {/* ===== PANEL (como el "Crear Imagen" de Aria) ===== */}
            <div className="aria-panel">
              <div className="aria-pscroll">
                <button className="apchar" onClick={() => setAbierto('personaje')}>
                  {personaje.refs[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="th" src={personaje.refs[0]} alt="" />
                  ) : (
                    <span className="th"><Icon name="user" /></span>
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div className="lb">PERSONAJE</div>
                    <div className="nm">{personaje.nombre || (personaje.refs.length ? 'Listo' : 'Subí la cara')}</div>
                  </div>
                  {personaje.refs.length ? <span className="ck">✓</span> : <span className="chev">›</span>}
                </button>

                <div className="apieces">
                  <PieceCard on={!!vestidoActual} icon="shirt" label="Vestido" value={vestidoActual ? (vestidoActual.nombre || 'Elegido') : 'por defecto'} thumb={vestidoActual?.url} onClick={() => setAbierto('vestidos')} />
                  {GALERIAS.map((g) => {
                    const it = (galerias[g.key] ?? []).find((i) => i.id === galSel[g.key]);
                    return <PieceCard key={g.key} on={!!it} icon={ICONO[g.key] ?? 'image'} label={RAIL_LABEL[g.key] ?? g.titulo} value={it ? 'Elegida' : 'por defecto'} thumb={it?.url} onClick={() => setAbierto(`gal:${g.key}`)} />;
                  })}
                  {CATEGORIAS.map((cat) => {
                    const op = cat.opciones.find((o) => o.id === sel[cat.key]);
                    return <PieceCard key={cat.key} on={!!op} icon={ICONO[cat.key] ?? 'palette'} label={RAIL_LABEL[cat.key] ?? cat.titulo} value={op ? op.label : 'por defecto'} onClick={() => setAbierto(cat.key)} />;
                  })}
                </div>

                <div className="aplbl">Referencias (@imagen)</div>
                <div className="arefbox">
                  {editImgs.map((u, i) => (
                    <div key={u} className="aref">
                      <Image src={u} alt="" fill sizes="46px" />
                      <span className="tag">imagen {i + 1}</span>
                      <button className="x" onClick={() => quitarEdit(u)}>×</button>
                    </div>
                  ))}
                  {editImgs.length < 6 ? (
                    <label className="arefadd">
                      <input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={onSubirEdit} style={{ display: 'none' }} />
                      <span style={{ fontSize: 18, color: 'var(--rosa)' }}>＋</span>
                      <span>{subiendoEdit ? '…' : 'Subir'}</span>
                    </label>
                  ) : null}
                </div>

                <div className="aplbl">Modelo de imagen</div>
                <select className="select" value={modelo} onChange={(e) => setModelo(e.target.value as ModeloId)} style={{ width: '100%' }}>
                  {MODELOS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>

                <div className="aplbl">Formato · Cantidad</div>
                <div className="afmt">
                  {ASPECTS.map((a) => <button key={a} className={`fb ${aspect === a ? 'on' : ''}`} onClick={() => setAspect(a)}>{a}</button>)}
                  <select className="select" value={cantidad} onChange={(e) => setCantidad(Number(e.target.value))} style={{ height: 30, marginLeft: 'auto', width: 66 }}>
                    {[1, 2, 3, 4].map((n) => <option key={n} value={n}>×{n}</option>)}
                  </select>
                </div>

                <div className="aplbl">Prompt</div>
                <textarea className="textarea" style={{ height: 92 }} value={editPrompt} onChange={(e) => setEditPrompt(e.target.value)} placeholder="Describí lo que querés crear. Ej: la misma mujer, en bikini en la playa, pose sensual, foto realista. Podés nombrar las referencias como imagen 1, imagen 2…" />
                <button className="btn-ghost" style={{ marginTop: 8, width: '100%' }} onClick={() => setEditPrompt('Recreá la imagen 1 tal cual (misma escena, fondo, pose, luz y encuadre). La chica debe ser la de la imagen 2 (misma cara e identidad).')}>📸 Clonar foto + cambiar cara</button>
              </div>
              <div className="aria-pfoot">
                <button className={`btn-grad shine ${busy ? 'busy' : ''}`} onClick={generarUnificado} disabled={!puedeCrear} style={{ width: '100%' }}>
                  {busy ? `Generando… ${resultUrls.length}/${cantidad}` : '✨ Generar imagen'}
                </button>
                {!busy && !puedeCrear ? <p className="sub" style={{ margin: '8px 0 0', fontSize: 12 }}>Subí la cara del personaje o una referencia.</p> : null}
                {statusMsg ? <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--violeta)' }}>{statusMsg}</p> : null}
                {error ? <p className="errbox" style={{ margin: '8px 0 0' }}>{error}</p> : null}
              </div>
            </div>

            {/* ===== MAIN: preview grande + galería ===== */}
            <div className="aria-main">
              <div className="aria-preview">
                {busy ? (
                  <div className="pv"><div className="sk" /></div>
                ) : previewActual ? (
                  <div>
                    <div className="pv result-pop" onClick={() => openResult(previewActual.url)} style={{ cursor: 'pointer' }}>
                      <Image src={previewActual.url} alt="creación" fill sizes="250px" priority />
                      <div className="cap">Tu creación{previewActual.modelo ? ` · ${MODELOS.find((m) => m.id === previewActual.modelo)?.label ?? ''}` : ''}</div>
                    </div>
                    <div className="pvactions">
                      <a className="btn-soft" href={previewActual.url} target="_blank" rel="noreferrer">⬇ Descargar</a>
                      <button className="btn-soft" disabled={!!mejorando} onClick={() => mejorar(previewActual)}>{mejorando ? 'Mejorando…' : '🔎 Mejorar'}</button>
                      {previewActual.prompt && previewActual.refs?.length ? <button className="btn-soft" onClick={() => variar(previewActual)}>🔁 Variar</button> : null}
                    </div>
                  </div>
                ) : (
                  <div className="pv-empty">
                    <Icon name="sparkles" />
                    <div style={{ fontWeight: 700, color: 'var(--ink)', marginTop: 8 }}>Acá va a aparecer tu creación</div>
                    <div style={{ fontSize: 13, marginTop: 4 }}>Armá a la izquierda y tocá Generar.</div>
                  </div>
                )}
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <h2 className="h2" style={{ fontSize: 15 }}>Mis creaciones</h2>
                  <span className="sub" style={{ fontSize: 12 }}>· {creaciones.length}</span>
                </div>
                {creaciones.length === 0 ? (
                  <div className="panel"><p className="sub" style={{ margin: 0 }}>Todavía no generaste fotos.</p></div>
                ) : (
                  <>
                    <div className="grid-cards">
                      {creaciones.slice(0, 6).map((c) => (
                        <div key={c.id} className="tile" onClick={() => { setMotion(''); setLightbox(c); }}>
                          <Image src={c.url} alt="creación" fill sizes="(max-width: 600px) 45vw, 160px" unoptimized={false} />
                          <button className="xbtn" title="Eliminar" onClick={(e) => { e.stopPropagation(); borrarCreacion(c); }}>🗑️</button>
                        </div>
                      ))}
                    </div>
                    {creaciones.length > 6 ? (
                      <button className="btn-ghost" style={{ marginTop: 12 }} onClick={() => setVista('galeria')}>Ver todas ({creaciones.length}) en la Galería →</button>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          </div>
        ) : vista === 'voz' ? (
          <>
            <h1 className="h1" style={{ marginBottom: 10 }}>🎙️ Voz de tu modelo</h1>
            {!vozCargada ? (
              <p className="sub">Cargando…</p>
            ) : (
              <>
                {!vozKey ? (
                  <div className="panel" style={{ marginBottom: 16, borderColor: '#f3cfcb', background: 'var(--err-soft)' }}>
                    <div className="h2" style={{ marginBottom: 6 }}>Falta activar la voz</div>
                    <p className="sub" style={{ marginTop: 0 }}>Para que funcione, creá una cuenta gratis en <b>fish.audio</b>, conseguí tu <b>API key</b> y cargala en <b>Vercel</b> como variable <b>FISH_AUDIO_API_KEY</b>.</p>
                    <p className="sub" style={{ marginBottom: 0 }}>En Vercel: <b>Settings → Environment Variables → Add New</b> → nombre <b>FISH_AUDIO_API_KEY</b>, pegás la clave, <b>Save</b>, y después <b>Redeploy</b>. ¡Nunca la pegues acá en el chat!</p>
                  </div>
                ) : null}

                <div className="panel" style={{ marginBottom: 16 }}>
                  <div className="h2" style={{ marginBottom: 6 }}>Identidad de voz</div>
                  <p className="sub" style={{ marginTop: 0 }}>Elegí o cloná una voz en <b>fish.audio</b>, copiá el <b>ID del modelo de voz</b> y pegalo acá. Esa va a ser la voz fija de tu modelo.</p>
                  <label style={{ fontSize: 13, fontWeight: 700, display: 'block' }}>ID de la voz (reference_id)
                    <input className="input" value={vozRef} onChange={(e) => setVozRef(e.target.value)} placeholder="Ej: 7f3a9c… (lo copiás de fish.audio)" style={{ display: 'block', marginTop: 6, width: '100%', boxSizing: 'border-box' }} />
                  </label>
                  <label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginTop: 12 }}>Nombre (opcional)
                    <input className="input" value={vozNombre} onChange={(e) => setVozNombre(e.target.value)} placeholder="Ej: Voz de Luna" style={{ display: 'block', marginTop: 6, width: 260, maxWidth: '100%' }} />
                  </label>
                  <button className="btn-grad" style={{ marginTop: 12 }} onClick={guardarVoz}>{vozGuardado ? 'Guardado ✓' : 'Guardar identidad de voz'}</button>
                  <p className="sub" style={{ marginBottom: 0, marginTop: 10, fontSize: 12 }}>💡 Si dejás el ID vacío, usa una voz por defecto de Fish Audio.</p>
                </div>

                <div className="panel" style={{ marginBottom: 16 }}>
                  <div className="h2" style={{ marginBottom: 6 }}>Generar audio</div>
                  <textarea className="textarea" value={vozText} onChange={(e) => setVozText(e.target.value)} placeholder="Escribí lo que querés que diga tu modelo…" style={{ height: 110 }} />
                  <button className={`btn-grad shine ${vozGen ? 'busy' : ''}`} style={{ marginTop: 10 }} disabled={vozGen || !vozText.trim()} onClick={generarVoz}>{vozGen ? 'Generando…' : '🎙️ Generar voz'}</button>
                  {vozMsg ? <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--violeta)' }}>{vozMsg}</p> : null}
                  {vozErr ? <p className="errbox" style={{ margin: '10px 0 0' }}>{vozErr}</p> : null}
                </div>

                <div className="h2" style={{ marginBottom: 10 }}>Mis audios ({vozItems.length})</div>
                {vozItems.length === 0 ? (
                  <div className="panel"><p className="sub" style={{ margin: 0 }}>Todavía no generaste audios.</p></div>
                ) : (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {vozItems.map((a) => (
                      <div key={a.id} className="panel" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px' }}>
                        <audio src={a.url} controls preload="metadata" style={{ flex: 1, minWidth: 0 }} />
                        <a className="btn-soft" href={a.url} target="_blank" rel="noreferrer">⬇</a>
                        <button className="btn-soft" onClick={() => borrarAudio(a)}>🗑️</button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
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
                      <Image src={c.url} alt="creación" fill sizes="(max-width: 600px) 45vw, 160px" unoptimized={false} />
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

      {/* Barra de consola (desktop) */}
      <div className="consola">
        <span>CONSOLA · <span className="k">Kie API</span> · {modeloLabel}</span>
        <div className="rr"><span>{creaciones.length} creaciones</span><span>{videos.length} videos</span><span>● API en vivo</span></div>
      </div>

      {/* ===== MODALES ===== */}
      {abierto === 'personaje' ? (
        <Modal title="Tu personaje" onClose={() => setAbierto(null)}>
          <p className="sub" style={hintS}>La cara que se mantiene igual en todas las fotos (subí 1 a 3).</p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {personaje.refs.map((url) => (
              <div key={url} style={{ position: 'relative', width: 96, height: 120 }}>
                <Image src={url} alt="cara" fill sizes="96px" style={{ objectFit: 'cover', borderRadius: 12, border: '1px solid var(--line)' }} />
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
// Etiquetas cortas para la barra lateral (los títulos largos no entran).
const RAIL_LABEL: Record<string, string> = {
  peinados: 'Peinados', poses: 'Poses', escenas: 'Escenas', cine: 'Cine',
  expresion: 'Expresión', luz: 'Luz', estilo: 'Estilo', encuadre: 'Encuadre',
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
            <Image src={it.url} alt="" fill sizes="(max-width: 600px) 45vw, 160px" />
            {s ? <span className="badge">Elegida</span> : null}
            <button className="xbtn" onClick={(ev) => { ev.stopPropagation(); onDelete(it.id); }}>×</button>
          </div>
        );
      })}
    </div>
  );
}

function PieceCard(props: { on: boolean; icon: string; label: string; value: string; thumb?: string; onClick: () => void }) {
  const { on, icon, label, value, thumb, onClick } = props;
  return (
    <button className={`apc ${on ? 'on' : ''}`} onClick={onClick}>
      {thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="th" src={thumb} alt="" />
      ) : (
        <span className="th"><Icon name={icon} /></span>
      )}
      <div className="t">{label}</div>
      <div className="v">{value}</div>
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
