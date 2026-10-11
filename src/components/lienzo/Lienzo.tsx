'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { upload } from '@vercel/blob/client';

import { quitarSonido } from '@/lib/cliente/video';
import { componerNodoFoto, type RolImagen } from '@/lib/estudio/prompt';
import {
  ANCHO, DEF, ORDEN_MENU, nuevoId, plantillaMotionExacto, yEntrada, ySalida,
  type Cable, type Dato, type Nodo, type TipoNodo, type Vista,
} from './tipos';

/* ===================== Tipos de props ===================== */
export type ModeloLz = { id: string; nombre: string; refs: string[]; cuerpo?: string; entero?: string; medio?: string };
type Props = {
  modelas: ModeloLz[];
  activoId: string;
  vestidos: { id: string; url: string; nombre?: string }[];
  galeria: { url: string }[];
  galerias: Record<string, { url: string }[]>;
  costo: (clave: string) => number | null;
  claveFoto: (modelo: string) => string;
  onCreacion: (c: { url: string; prompt: string; modelo: string; refs: string[]; aspect: string; credits?: number }) => void;
  onVideo: (url: string) => void;
  onTrabajo: (msg: string) => void;
  onPublicar: (url: string, tipo: 'foto' | 'video') => void;
  onGuardar: (url: string, tipo: 'foto' | 'video') => void;
  onSaldo: () => void;
};

/** Lo que "sale" de una caja hacia las cajas conectadas. */
type Salida =
  | { tipo: 'video'; url: string; mb?: number; dur?: number }
  | { tipo: 'imagen'; items: { url: string; rol: RolImagen }[]; asp?: string; cuerpo?: string }
  | { tipo: 'texto'; texto: string }
  | { tipo: 'audio'; url: string; dur?: number };

const COLOR: Record<Dato, string> = { video: '#f0a33c', imagen: '#d6457f', texto: '#7a5af0', audio: '#1fa463' };
// "Mila hablando": motores de Kie y su precio por segundo de audio (créditos).
const HABLAR = [
  { id: 'kling-std', label: 'Kling Avatar ⭐', desc: '720p · buena calidad', porSeg: 8, maxSeg: 300 },
  { id: 'kling-pro', label: 'Kling Avatar Pro', desc: '1080p · la mejor calidad', porSeg: 16, maxSeg: 300 },
  { id: 'inf-480', label: 'InfiniteTalk 480p', desc: 'El más barato · audio hasta 15 s', porSeg: 3, maxSeg: 15 },
  { id: 'inf-720', label: 'InfiniteTalk 720p', desc: 'Audio hasta 15 s', porSeg: 12, maxSeg: 15 },
];
const FOTO_MODELOS = [
  { id: 'seedream', label: 'Seedream 4.5 ⭐' },
  { id: 'nanopro', label: 'Nano Banana Pro' },
  { id: 'nano', label: 'Nano Banana' },
];
const FORMATOS = ['auto', '9:16', '3:4', '1:1', '16:9'];
const ORDEN_ROL: RolImagen[] = ['captura', 'base', 'cara', 'cuerpo', 'vestuario', 'escena', 'peinado', 'pose', 'imagen'];
// Caja → galería de la app de donde se eligen las imágenes.
const GALERIA_DE: Partial<Record<TipoNodo, string>> = { escena: 'escenas', peinado: 'peinados', pose: 'poses' };
const MAX_IMAGENES = 8;

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString('es-AR');
function costoTxt(c: number | null): string {
  return c === null ? 'Costo: lo vas a ver después de la primera vez' : `≈ ${fmt(c)} créditos (≈ US$ ${(c * 0.005).toFixed(2).replace('.', ',')})`;
}
function aspecto(w: number, h: number): string {
  const r = w / Math.max(1, h);
  const ops: [string, number][] = [['9:16', 9 / 16], ['3:4', 3 / 4], ['1:1', 1], ['4:3', 4 / 3], ['16:9', 16 / 9]];
  return ops.reduce((a, b) => (Math.abs(b[1] - r) < Math.abs(a[1] - r) ? b : a))[0];
}
async function subirImagen(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  form.append('folder', 'refs');
  const res = await fetch('/api/upload', { method: 'POST', body: form });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d.url) throw new Error(d.error ?? 'No se pudo subir la imagen.');
  return d.url as string;
}
function metaVideo(file: File): Promise<number> {
  return new Promise((resolve) => {
    const u = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => { URL.revokeObjectURL(u); resolve(Number.isFinite(v.duration) ? v.duration : 0); };
    v.onerror = () => { URL.revokeObjectURL(u); resolve(0); };
    v.src = u;
  });
}

/* ===================== Lienzo ===================== */
export default function Lienzo(props: Props) {
  const { modelas, activoId, vestidos, galeria, galerias, costo, claveFoto, onCreacion, onVideo, onTrabajo, onPublicar, onGuardar, onSaldo } = props;
  const [nodes, setNodes] = useState<Nodo[]>([]);
  const [edges, setEdges] = useState<Cable[]>([]);
  const [view, setView] = useState<Vista>({ x: 20, y: 110, z: 0.8 });
  const [cargado, setCargado] = useState(false);
  const [menu, setMenu] = useState(false);
  const [conectando, setConectando] = useState<{ de: string; x: number; y: number } | null>(null);
  const [guardado, setGuardado] = useState<'' | 'guardando' | 'ok' | 'error'>('');
  const [lista, setLista] = useState<{ id: string; nombre: string }[]>([]);
  const [lienzoId, setLienzoId] = useState('principal');

  const cont = useRef<HTMLDivElement | null>(null);
  const vivo = useRef(true);
  const nodesRef = useRef(nodes); nodesRef.current = nodes;
  const edgesRef = useRef(edges); edgesRef.current = edges;
  const viewRef = useRef(view); viewRef.current = view;
  const gesto = useRef<{
    modo: '' | 'pan' | 'drag' | 'conn' | 'pinch';
    punteros: Map<number, { x: number; y: number }>;
    inicio?: { x: number; y: number; vista: Vista };
    nodo?: string; off?: { x: number; y: number };
    pinch?: { dist: number; cx: number; cy: number; vista: Vista };
  }>({ modo: '', punteros: new Map() });

  /* ----- cargar / guardar ----- */
  useEffect(() => {
    vivo.current = true;
    (async () => {
      try {
        const d = await fetch('/api/lienzo').then((r) => r.json());
        aplicar(d);
      } catch { /* */ } finally { setCargado(true); }
    })();
    return () => { vivo.current = false; };
  }, []);

  function aplicar(d: { id?: string; lista?: { id: string; nombre: string }[]; nodes?: Nodo[]; edges?: Cable[]; view?: Vista }) {
    if (Array.isArray(d.lista)) setLista(d.lista);
    if (typeof d.id === 'string') setLienzoId(d.id);
    setNodes(Array.isArray(d.nodes) ? d.nodes : []);
    setEdges(Array.isArray(d.edges) ? d.edges : []);
    setView(d.view && typeof d.view.z === 'number' ? d.view : { x: 20, y: 110, z: 0.8 });
  }
  async function guardarAhora(id: string, ns: Nodo[], es: Cable[], v: Vista) {
    setGuardado('guardando');
    try {
      const res = await fetch('/api/lienzo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, nodes: ns, edges: es, view: v }) });
      setGuardado(res.ok ? 'ok' : 'error');
    } catch { setGuardado('error'); }
  }
  // Autoguardado (cada cambio, con una pausita).
  const cambiando = useRef(false);
  useEffect(() => {
    if (!cargado || cambiando.current) return;
    setGuardado('guardando');
    const t = setTimeout(() => guardarAhora(lienzoId, nodes, edges, view), 900);
    return () => clearTimeout(t);
  }, [nodes, edges, view, cargado, lienzoId]);

  /* ----- varios lienzos ----- */
  const ocupado = () => nodesRef.current.some((n) => n.data.estado === 'corriendo');
  async function guardarLista(nueva: { id: string; nombre: string }[], activo: string) {
    setLista(nueva);
    await fetch('/api/lienzo', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lista: nueva, activo }) }).catch(() => undefined);
  }
  async function abrirLienzo(id: string, listaNueva = lista) {
    if (id === lienzoId) return;
    if (ocupado()) { window.alert('Esperá a que termine lo que se está creando en este lienzo.'); return; }
    cambiando.current = true;
    try {
      await guardarAhora(lienzoId, nodesRef.current, edgesRef.current, viewRef.current);
      await guardarLista(listaNueva, id);
      const d = await fetch(`/api/lienzo?id=${encodeURIComponent(id)}`).then((r) => r.json()).catch(() => ({}));
      aplicar({ ...d, id, lista: listaNueva });
    } finally { cambiando.current = false; }
  }
  async function nuevoLienzo() {
    const nombre = window.prompt('Nombre del lienzo nuevo (ej: Bailes, Cama, Gym):', `Lienzo ${lista.length + 1}`);
    if (nombre === null) return;
    const id = `l${Date.now().toString(36)}`;
    const nueva = [...lista, { id, nombre: nombre.trim() || `Lienzo ${lista.length + 1}` }];
    if (ocupado()) { window.alert('Esperá a que termine lo que se está creando en este lienzo.'); return; }
    cambiando.current = true;
    try {
      await guardarAhora(lienzoId, nodesRef.current, edgesRef.current, viewRef.current);
      await guardarLista(nueva, id);
      aplicar({ id, lista: nueva, nodes: [], edges: [] });
    } finally { cambiando.current = false; }
  }
  async function renombrar() {
    const actual = lista.find((x) => x.id === lienzoId);
    const nombre = window.prompt('Nuevo nombre del lienzo:', actual?.nombre ?? '');
    if (!nombre || !nombre.trim()) return;
    await guardarLista(lista.map((x) => (x.id === lienzoId ? { ...x, nombre: nombre.trim().slice(0, 40) } : x)), lienzoId);
  }
  async function borrarLienzo() {
    if (lista.length < 2) { window.alert('Tiene que quedar al menos un lienzo.'); return; }
    const actual = lista.find((x) => x.id === lienzoId);
    if (!window.confirm(`¿Borrar el lienzo “${actual?.nombre ?? ''}”? Las fotos y videos creados quedan en tu galería.`)) return;
    const nueva = lista.filter((x) => x.id !== lienzoId);
    cambiando.current = true;
    try {
      await guardarAhora(lienzoId, [], [], { x: 20, y: 110, z: 0.8 });
      await guardarLista(nueva, nueva[0].id);
      const d = await fetch(`/api/lienzo?id=${encodeURIComponent(nueva[0].id)}`).then((r) => r.json()).catch(() => ({}));
      aplicar({ ...d, id: nueva[0].id, lista: nueva });
    } finally { cambiando.current = false; }
  }

  /* ----- aviso flotante "creando" ----- */
  useEffect(() => {
    const corriendo = nodes.filter((n) => n.data.estado === 'corriendo');
    onTrabajo(corriendo.length ? `🧩 Lienzo: ${corriendo.map((n) => DEF[n.tipo].titulo).join(' + ')} trabajando…` : '');
  }, [nodes, onTrabajo]);

  /* ----- helpers de datos ----- */
  const setData = useCallback((id: string, patch: Record<string, unknown>) => {
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)));
  }, []);
  const entradas = (id: string, puerto: string, ns = nodesRef.current, es = edgesRef.current) =>
    es.filter((e) => e.a === id && e.puerto === puerto).map((e) => ns.find((n) => n.id === e.de)).filter((n): n is Nodo => !!n);

  function salidaDe(n: Nodo): Salida | null {
    const d = n.data;
    switch (n.tipo) {
      case 'video': return typeof d.url === 'string' && d.url ? { tipo: 'video', url: d.url, mb: d.mb as number, dur: d.dur as number } : null;
      case 'captura': return typeof d.url === 'string' && d.url ? { tipo: 'imagen', items: [{ url: d.url, rol: 'captura' }], asp: d.asp as string } : null;
      case 'modelo': {
        const m = modelas.find((x) => x.id === d.modeloId) ?? modelas.find((x) => x.id === activoId);
        if (!m || !m.refs.length) return null;
        const items: { url: string; rol: RolImagen }[] = m.refs.map((url) => ({ url, rol: 'cara' as const }));
        const cuerpo = m.entero || m.medio;
        if (d.cuerpo !== false && cuerpo) items.push({ url: cuerpo, rol: 'cuerpo' });
        return { tipo: 'imagen', items, cuerpo: m.cuerpo };
      }
      case 'vestuario': return typeof d.url === 'string' && d.url ? { tipo: 'imagen', items: [{ url: d.url, rol: 'vestuario' }] } : null;
      case 'escena': case 'peinado': case 'pose':
        return typeof d.url === 'string' && d.url ? { tipo: 'imagen', items: [{ url: d.url, rol: n.tipo }] } : null;
      case 'imagen': return typeof d.url === 'string' && d.url ? { tipo: 'imagen', items: [{ url: d.url, rol: 'imagen' }] } : null;
      case 'prompt': return typeof d.texto === 'string' && d.texto.trim() ? { tipo: 'texto', texto: d.texto } : null;
      case 'foto': return typeof d.elegida === 'string' && d.elegida ? { tipo: 'imagen', items: [{ url: d.elegida, rol: 'base' }], asp: d.asp as string } : null;
      case 'motion': case 'hablar': return typeof d.resultado === 'string' && d.resultado ? { tipo: 'video', url: d.resultado } : null;
      case 'audio': return typeof d.url === 'string' && d.url ? { tipo: 'audio', url: d.url, dur: d.dur as number } : null;
      default: return null;
    }
  }

  /* ----- esperar una tarea de la IA ----- */
  async function esperar(taskId: string): Promise<{ url: string; credits?: number }> {
    for (let i = 0; i < 160; i++) {
      await dormir(i < 20 ? 3000 : 7000);
      if (!vivo.current) throw new Error('cancelado');
      const d = await fetch(`/api/status?taskId=${encodeURIComponent(taskId)}`).then((r) => r.json()).catch(() => ({}));
      if (d.state === 'success' && d.url) return { url: d.url as string, credits: typeof d.credits === 'number' ? d.credits : undefined };
      if (d.state === 'fail') throw new Error(d.error || 'La IA no pudo crearlo. Probá de nuevo.');
    }
    throw new Error('Tardó demasiado. Probá de nuevo.');
  }

  /* ----- correr "Foto IA" ----- */
  async function correrFoto(id: string) {
    const n = nodesRef.current.find((x) => x.id === id);
    if (!n || n.data.estado === 'corriendo') return;
    const sal = entradas(id, 'imgs').map(salidaDe).filter((s): s is Extract<Salida, { tipo: 'imagen' }> => !!s && s.tipo === 'imagen');
    const items = sal.flatMap((s) => s.items)
      .sort((a, b) => ORDEN_ROL.indexOf(a.rol) - ORDEN_ROL.indexOf(b.rol))
      .filter((it, i, arr) => arr.findIndex((x) => x.url === it.url) === i)
      .slice(0, MAX_IMAGENES);
    if (!items.length) { setData(id, { error: 'Conectá al menos una imagen (Captura, Modelo, Vestuario…).' }); return; }
    const textos = entradas(id, 'txt').map(salidaDe).flatMap((s) => (s && s.tipo === 'texto' ? [s.texto] : []));
    const cuerpo = sal.find((s) => s.cuerpo)?.cuerpo;
    const prompt = componerNodoFoto(items.map((x) => x.rol), textos, cuerpo);
    const modelo = (n.data.modelo as string) || 'seedream';
    const formato = (n.data.aspect as string) || 'auto';
    const aspect = formato === 'auto' ? (sal.find((s) => s.asp)?.asp || '9:16') : formato;
    const imageUrls = items.map((x) => x.url);
    setData(id, { estado: 'corriendo', error: '' });
    try {
      const res = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, imageUrls, aspect, modelo }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.taskId) throw new Error(d.error ?? 'No se pudo crear la foto.');
      setData(id, { taskId: d.taskId, pend: { prompt, imageUrls, aspect, modelo } });
      await terminarFoto(id, d.taskId, { prompt, imageUrls, aspect, modelo });
    } catch (e) {
      if (vivo.current) setData(id, { estado: '', taskId: '', error: e instanceof Error ? e.message : 'Error.' });
    }
  }
  async function terminarFoto(id: string, taskId: string, meta: { prompt: string; imageUrls: string[]; aspect: string; modelo: string }) {
    try {
      const r = await esperar(taskId);
      setNodes((ns) => ns.map((x) => x.id !== id ? x : {
        ...x,
        data: { ...x.data, estado: '', taskId: '', pend: null, asp: meta.aspect, resultados: [r.url, ...((x.data.resultados as string[]) ?? [])].slice(0, 6), ultimo: r.url, credits: r.credits },
      }));
      onCreacion({ url: r.url, prompt: meta.prompt, modelo: meta.modelo, refs: meta.imageUrls, aspect: meta.aspect, credits: r.credits });
      onSaldo();
    } catch (e) {
      if (vivo.current && !(e instanceof Error && e.message === 'cancelado')) setData(id, { estado: '', taskId: '', error: e instanceof Error ? e.message : 'Error.' });
    }
  }

  /* ----- correr "Motion Control" ----- */
  async function correrMotion(id: string) {
    const n = nodesRef.current.find((x) => x.id === id);
    if (!n || n.data.estado === 'corriendo') return;
    const img = entradas(id, 'imagen').map(salidaDe).find((s) => s?.tipo === 'imagen') as Extract<Salida, { tipo: 'imagen' }> | undefined;
    const vid = entradas(id, 'video').map(salidaDe).find((s) => s?.tipo === 'video') as Extract<Salida, { tipo: 'video' }> | undefined;
    const txt = entradas(id, 'txt').map(salidaDe).flatMap((s) => (s && s.tipo === 'texto' ? [s.texto] : [])).join('. ');
    if (!img?.items[0]) { setData(id, { error: 'Conectá la imagen inicial (aprobá una foto en la caja Foto IA).' }); return; }
    if (!vid) { setData(id, { error: 'Conectá una caja Video con el video subido.' }); return; }
    const motor = (n.data.motor as string) || 'kling3';
    if (motor === 'wan' && (vid.mb ?? 0) > 10) { setData(id, { error: `Para "Reemplazar" el video tiene que pesar hasta 10 MB (pesa ${fmt(vid.mb ?? 0)} MB).` }); return; }
    const m = modelas.find((x) => x.id === activoId);
    setData(id, { estado: 'corriendo', error: '' });
    try {
      const res = await fetch('/api/motion', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modo: motor === 'wan' ? 'reemplazar' : 'mover', motor, imageUrl: img.items[0].url, videoUrl: vid.url,
          orientacion: (n.data.orientacion as string) || 'video', calidad: (n.data.calidad as string) || '720p', cuerpo: m?.cuerpo, prompt: txt,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.taskId) throw new Error(d.error ?? 'No se pudo crear el video.');
      setData(id, { taskId: d.taskId });
      await terminarMotion(id, d.taskId);
    } catch (e) {
      if (vivo.current) setData(id, { estado: '', taskId: '', error: e instanceof Error ? e.message : 'Error.' });
    }
  }
  async function terminarMotion(id: string, taskId: string) {
    try {
      const r = await esperar(taskId);
      setData(id, { estado: '', taskId: '', resultado: r.url, credits: r.credits });
      onVideo(r.url);
      onSaldo();
    } catch (e) {
      if (vivo.current && !(e instanceof Error && e.message === 'cancelado')) setData(id, { estado: '', taskId: '', error: e instanceof Error ? e.message : 'Error.' });
    }
  }

  /* ----- correr "Mila hablando" ----- */
  async function correrHablar(id: string) {
    const n = nodesRef.current.find((x) => x.id === id);
    if (!n || n.data.estado === 'corriendo') return;
    const img = entradas(id, 'imagen').map(salidaDe).find((s) => s?.tipo === 'imagen') as Extract<Salida, { tipo: 'imagen' }> | undefined;
    const aud = entradas(id, 'audio').map(salidaDe).find((s) => s?.tipo === 'audio') as Extract<Salida, { tipo: 'audio' }> | undefined;
    const txt = entradas(id, 'txt').map(salidaDe).flatMap((s) => (s && s.tipo === 'texto' ? [s.texto] : [])).join('. ');
    if (!img?.items[0]) { setData(id, { error: 'Conectá una foto (por ejemplo una aprobada en Foto IA, o la caja Modelo).' }); return; }
    if (!aud) { setData(id, { error: 'Conectá una caja Audio con la voz.' }); return; }
    const motor = (n.data.motor as string) || 'kling-std';
    const def = HABLAR.find((h) => h.id === motor) ?? HABLAR[0];
    if ((aud.dur ?? 0) > def.maxSeg) { setData(id, { error: `${def.label} acepta audios de hasta ${def.maxSeg} s (el tuyo dura ${Math.round(aud.dur ?? 0)} s). Usá Kling Avatar o recortá el audio.` }); return; }
    setData(id, { estado: 'corriendo', error: '' });
    try {
      const res = await fetch('/api/hablar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageUrl: img.items[0].url, audioUrl: aud.url, motor, prompt: txt }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.taskId) throw new Error(d.error ?? 'No se pudo crear el video.');
      setData(id, { taskId: d.taskId });
      await terminarMotion(id, d.taskId);
    } catch (e) {
      if (vivo.current) setData(id, { estado: '', taskId: '', error: e instanceof Error ? e.message : 'Error.' });
    }
  }

  // Si la app se cerró con algo corriendo, lo seguimos esperando al volver.
  const retomado = useRef(false);
  useEffect(() => {
    if (!cargado || retomado.current) return;
    retomado.current = true;
    for (const n of nodesRef.current) {
      if (n.data.estado !== 'corriendo') continue;
      const t = n.data.taskId as string;
      if (!t) { setData(n.id, { estado: '' }); continue; }
      if (n.tipo === 'foto' && n.data.pend) terminarFoto(n.id, t, n.data.pend as { prompt: string; imageUrls: string[]; aspect: string; modelo: string });
      else if (n.tipo === 'motion' || n.tipo === 'hablar') terminarMotion(n.id, t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargado]);

  /* ----- agregar / borrar ----- */
  function centroMundo() {
    const r = cont.current?.getBoundingClientRect();
    const v = viewRef.current;
    if (!r) return { x: 0, y: 0 };
    return { x: (r.width / 2 - v.x) / v.z - ANCHO / 2, y: (r.height / 2 - v.y) / v.z - 80 };
  }
  function agregar(tipo: TipoNodo) {
    const c = centroMundo();
    const off = (nodesRef.current.length % 5) * 24;
    const data: Record<string, unknown> =
      tipo === 'modelo' ? { modeloId: activoId, cuerpo: true }
        : tipo === 'foto' ? { modelo: 'seedream', aspect: 'auto' }
          : tipo === 'motion' ? { motor: 'kling3', calidad: '720p', orientacion: 'video' }
            : tipo === 'hablar' ? { motor: 'kling-std' }
            : tipo === 'prompt' ? { texto: '' } : {};
    setNodes((ns) => [...ns, { id: nuevoId(tipo.slice(0, 3)), tipo, x: c.x + off, y: c.y + off, data }]);
    setMenu(false);
  }
  function borrarNodo(id: string) {
    const n = nodesRef.current.find((x) => x.id === id);
    if (n?.data.estado === 'corriendo' && !window.confirm('Esta caja está trabajando. ¿Borrarla igual? (lo que se esté creando se pierde de vista)')) return;
    setNodes((ns) => ns.filter((x) => x.id !== id));
    setEdges((es) => es.filter((e) => e.de !== id && e.a !== id));
  }
  /** Copia una caja (con sus ajustes y los cables que le llegan) para probar variantes. */
  function duplicar(id: string) {
    const n = nodesRef.current.find((x) => x.id === id);
    if (!n) return;
    const nid = nuevoId(n.tipo.slice(0, 3));
    const { estado: _e, taskId: _t, pend: _p, error: _er, resultados: _r, elegida: _el, ultimo: _u, resultado: _res, ...data } = n.data;
    void _e; void _t; void _p; void _er; void _r; void _el; void _u; void _res;
    setNodes((ns) => [...ns, { ...n, id: nid, x: n.x + 30, y: n.y + 40, data }]);
    setEdges((es) => [...es, ...es.filter((e) => e.a === id).map((e) => ({ ...e, id: nuevoId('e'), a: nid }))]);
  }
  function usarPlantilla() {
    if (nodesRef.current.length && !window.confirm('¿Reemplazar lo que hay en el lienzo por la plantilla "Motion exacto"?')) return;
    const p = plantillaMotionExacto(activoId);
    setNodes(p.nodes); setEdges(p.edges);
    encuadrar(p.nodes);
  }
  function encuadrar(ns = nodesRef.current) {
    const r = cont.current?.getBoundingClientRect();
    if (!r || !ns.length) { setView({ x: 20, y: 110, z: 0.8 }); return; }
    const minX = Math.min(...ns.map((n) => n.x)), minY = Math.min(...ns.map((n) => n.y));
    const maxX = Math.max(...ns.map((n) => n.x + ANCHO)), maxY = Math.max(...ns.map((n) => n.y + 320));
    const z = Math.max(0.2, Math.min(1, Math.min((r.width - 40) / (maxX - minX), (r.height - 150) / (maxY - minY))));
    setView({ z, x: (r.width - (maxX - minX) * z) / 2 - minX * z, y: 110 - minY * z });
  }
  function zoom(f: number) {
    const r = cont.current?.getBoundingClientRect();
    if (!r) return;
    const v = viewRef.current;
    const z = Math.max(0.2, Math.min(2, v.z * f));
    const cx = r.width / 2, cy = r.height / 2;
    setView({ z, x: cx - ((cx - v.x) / v.z) * z, y: cy - ((cy - v.y) / v.z) * z });
  }

  /* ----- gestos: mover, arrastrar cajas, conectar, pellizcar ----- */
  function mundo(cx: number, cy: number) {
    const r = cont.current!.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (cx - r.left - v.x) / v.z, y: (cy - r.top - v.y) / v.z };
  }
  function onDown(e: React.PointerEvent) {
    const g = gesto.current;
    const t = e.target as HTMLElement;
    if (t.closest('[data-ui]')) return; // controles dentro de las cajas y la barra
    g.punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (g.punteros.size === 2) {
      const [a, b] = [...g.punteros.values()];
      g.modo = 'pinch';
      g.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, vista: viewRef.current };
      setConectando(null);
      return;
    }
    const out = t.closest('[data-out]') as HTMLElement | null;
    const inp = t.closest('[data-in]') as HTMLElement | null;
    const drag = t.closest('[data-drag]') as HTMLElement | null;
    cont.current?.setPointerCapture(e.pointerId);
    if (out) {
      g.modo = 'conn';
      const p = mundo(e.clientX, e.clientY);
      setConectando({ de: out.dataset.out!, x: p.x, y: p.y });
    } else if (inp) {
      // Tocar un enchufe de entrada desconecta sus cables.
      const [nodo, puerto] = inp.dataset.in!.split(':');
      setEdges((es) => es.filter((x) => !(x.a === nodo && x.puerto === puerto)));
      g.modo = '';
    } else if (drag) {
      const id = drag.dataset.drag!;
      const n = nodesRef.current.find((x) => x.id === id);
      if (!n) return;
      const p = mundo(e.clientX, e.clientY);
      g.modo = 'drag'; g.nodo = id; g.off = { x: p.x - n.x, y: p.y - n.y };
      // la caja tocada queda arriba
      setNodes((ns) => [...ns.filter((x) => x.id !== id), n]);
    } else {
      g.modo = 'pan';
      g.inicio = { x: e.clientX, y: e.clientY, vista: viewRef.current };
    }
  }
  function onMove(e: React.PointerEvent) {
    const g = gesto.current;
    if (!g.punteros.has(e.pointerId)) return;
    g.punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (g.modo === 'pinch' && g.pinch && g.punteros.size >= 2) {
      const [a, b] = [...g.punteros.values()];
      const r = cont.current!.getBoundingClientRect();
      const s = g.pinch;
      const z = Math.max(0.2, Math.min(2, s.vista.z * (Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, s.dist))));
      const wx = (s.cx - r.left - s.vista.x) / s.vista.z, wy = (s.cy - r.top - s.vista.y) / s.vista.z;
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      setView({ z, x: cx - r.left - wx * z, y: cy - r.top - wy * z });
    } else if (g.modo === 'pan' && g.inicio) {
      const s = g.inicio;
      setView({ ...s.vista, x: s.vista.x + e.clientX - s.x, y: s.vista.y + e.clientY - s.y });
    } else if (g.modo === 'drag' && g.nodo && g.off) {
      const p = mundo(e.clientX, e.clientY);
      const id = g.nodo, off = g.off;
      setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, x: Math.round(p.x - off.x), y: Math.round(p.y - off.y) } : n)));
    } else if (g.modo === 'conn') {
      const p = mundo(e.clientX, e.clientY);
      setConectando((c) => (c ? { ...c, x: p.x, y: p.y } : c));
    }
  }
  function onUp(e: React.PointerEvent) {
    const g = gesto.current;
    if (g.modo === 'conn') {
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-in]') as HTMLElement | null;
      const de = conectando?.de;
      if (el && de) {
        const [a, puerto] = el.dataset.in!.split(':');
        const nA = nodesRef.current.find((x) => x.id === a);
        const nDe = nodesRef.current.find((x) => x.id === de);
        const port = nA ? DEF[nA.tipo].entradas.find((p) => p.id === puerto) : undefined;
        const tipoSal = nDe ? DEF[nDe.tipo].salida : null;
        if (nA && port && tipoSal && a !== de && port.acepta.includes(tipoSal)) {
          setEdges((es) => {
            const sin = port.multi ? es : es.filter((x) => !(x.a === a && x.puerto === puerto));
            if (sin.some((x) => x.de === de && x.a === a && x.puerto === puerto)) return sin;
            return [...sin, { id: nuevoId('e'), de, a, puerto }];
          });
        }
      }
      setConectando(null);
    }
    g.punteros.delete(e.pointerId);
    // Al soltar todo (o al levantar un dedo del pellizco) se termina el gesto.
    if (g.punteros.size === 0 || g.modo === 'pinch') { g.modo = ''; g.inicio = undefined; g.nodo = undefined; g.pinch = undefined; }
  }
  // Rueda / trackpad: pellizco o Ctrl = zoom; si no, mover.
  useEffect(() => {
    const el = cont.current;
    if (!el) return;
    const h = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest('[data-ui]')) return;
      e.preventDefault();
      const v = viewRef.current;
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect();
        const z = Math.max(0.2, Math.min(2, v.z * Math.exp(-e.deltaY * 0.01)));
        const cx = e.clientX - r.left, cy = e.clientY - r.top;
        setView({ z, x: cx - ((cx - v.x) / v.z) * z, y: cy - ((cy - v.y) / v.z) * z });
      } else {
        setView({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY });
      }
    };
    el.addEventListener('wheel', h, { passive: false });
    return () => el.removeEventListener('wheel', h);
  }, []);

  /* ----- cables ----- */
  function puntoSalida(n: Nodo) { return { x: n.x + ANCHO, y: n.y + ySalida }; }
  function puntoEntrada(n: Nodo, puerto: string) {
    const i = Math.max(0, DEF[n.tipo].entradas.findIndex((p) => p.id === puerto));
    return { x: n.x, y: n.y + yEntrada(i) };
  }
  function curva(a: { x: number; y: number }, b: { x: number; y: number }) {
    const dx = Math.max(50, Math.abs(b.x - a.x) / 2);
    return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
  }

  /* ===================== Render ===================== */
  const deConectando = conectando ? nodes.find((n) => n.id === conectando.de) : undefined;
  const tipoConectando = deConectando ? DEF[deConectando.tipo].salida : null;

  return (
    <div
      ref={cont}
      className={`lz ${conectando ? 'conectando' : ''}`}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      style={{ backgroundPosition: `${view.x}px ${view.y}px`, backgroundSize: `${22 * view.z}px ${22 * view.z}px` }}
    >
      {/* Barra */}
      <div className="lz-barra" data-ui>
        <button className="btn-grad" onClick={() => setMenu(true)}>＋ Caja</button>
        <button className="btn-soft" onClick={usarPlantilla}>✨ Plantilla</button>
        <span style={{ flex: 1 }} />
        <button className="lz-ic" onClick={() => zoom(1 / 1.2)} aria-label="Alejar">−</button>
        <button className="lz-ic" onClick={() => zoom(1.2)} aria-label="Acercar">＋</button>
        <button className="lz-ic" onClick={() => encuadrar()} aria-label="Ver todo">⤢</button>
      </div>
      <div className="lz-barra2" data-ui>
        <select className="input lz-sel" value={lienzoId} onChange={(e) => abrirLienzo(e.target.value)} aria-label="Elegir lienzo">
          {(lista.length ? lista : [{ id: 'principal', nombre: 'Mi lienzo' }]).map((x) => <option key={x.id} value={x.id}>📁 {x.nombre}</option>)}
        </select>
        <button className="lz-ic" onClick={nuevoLienzo} aria-label="Lienzo nuevo" title="Lienzo nuevo">＋</button>
        <button className="lz-ic" onClick={renombrar} aria-label="Renombrar" title="Renombrar">✏️</button>
        <button className="lz-ic" onClick={borrarLienzo} aria-label="Borrar lienzo" title="Borrar lienzo">🗑️</button>
      </div>
      <div className="lz-guardado" data-ui>{guardado === 'guardando' ? 'Guardando…' : guardado === 'ok' ? '✓ Guardado' : guardado === 'error' ? '⚠️ No se guardó' : ''}</div>

      {cargado && !nodes.length ? (
        <div className="lz-vacio" data-ui>
          <div style={{ fontSize: 30 }}>🧩</div>
          <b>Tu lienzo está vacío</b>
          <p className="sub" style={{ margin: '6px 0 12px' }}>Arrancá con la plantilla para hacer Motion exacto, o agregá cajas una por una.</p>
          <button className="btn-grad" onClick={usarPlantilla}>✨ Usar plantilla “Motion exacto”</button>
          <button className="btn-soft" style={{ marginTop: 8 }} onClick={() => setMenu(true)}>＋ Agregar una caja</button>
        </div>
      ) : null}

      {/* Mundo */}
      <div className="lz-mundo" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }}>
        <svg className="lz-cables" width="1" height="1">
          {edges.map((e) => {
            const de = nodes.find((n) => n.id === e.de), a = nodes.find((n) => n.id === e.a);
            if (!de || !a) return null;
            const t = DEF[de.tipo].salida ?? 'imagen';
            return <path key={e.id} d={curva(puntoSalida(de), puntoEntrada(a, e.puerto))} stroke={COLOR[t]} />;
          })}
          {conectando && deConectando ? (
            <path className="temp" d={curva(puntoSalida(deConectando), conectando)} stroke={COLOR[tipoConectando ?? 'imagen']} />
          ) : null}
        </svg>

        {nodes.map((n) => {
          const def = DEF[n.tipo];
          const corriendo = n.data.estado === 'corriendo';
          return (
            <div key={n.id} className={`lz-nodo ${def.ia ? 'ia' : ''} ${corriendo ? 'corre' : ''}`} style={{ transform: `translate(${n.x}px, ${n.y}px)`, width: ANCHO }}>
              <div className="lz-cab" data-drag={n.id}>
                <span>{def.icono}</span><b>{def.titulo}</b>
                <button className="lz-x dup" data-ui onClick={() => duplicar(n.id)} aria-label="Duplicar caja" title="Duplicar">⧉</button>
                <button className="lz-x" data-ui onClick={() => borrarNodo(n.id)} aria-label="Borrar caja">×</button>
                {def.salida ? <span className="lz-out" data-out={n.id} style={{ background: COLOR[def.salida] }} title="Arrastrá para conectar" /> : null}
              </div>
              {def.entradas.map((p) => {
                const n2 = edges.filter((e) => e.a === n.id && e.puerto === p.id).length;
                const ok = tipoConectando ? p.acepta.includes(tipoConectando) : false;
                return (
                  <div key={p.id} className={`lz-fila ${ok ? 'acepta' : ''}`}>
                    <span className="lz-in" data-in={`${n.id}:${p.id}`} style={{ background: n2 ? COLOR[p.acepta[0]] : undefined, borderColor: COLOR[p.acepta[0]] }} title={n2 ? 'Tocá para desconectar' : 'Conectá un cable acá'} />
                    <span>{p.label}{n2 > 1 ? ` (${n2})` : ''}</span>
                  </div>
                );
              })}
              <div className="lz-cuerpo" data-ui>
                <CuerpoNodo
                  n={n}
                  setData={setData}
                  modelas={modelas}
                  vestidos={vestidos}
                  galeria={galeria}
                  galerias={galerias}
                  entradas={(p) => entradas(n.id, p, nodes, edges)}
                  salidaDe={salidaDe}
                  costo={costo}
                  claveFoto={claveFoto}
                  correrFoto={() => correrFoto(n.id)}
                  correrMotion={() => correrMotion(n.id)}
                  correrHablar={() => correrHablar(n.id)}
                  onPublicar={onPublicar}
                  onGuardar={onGuardar}
                  conectadaASalida={edges.some((e) => e.de === n.id)}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Menú de cajas */}
      {menu ? (
        <div className="lz-menu-ov" data-ui onClick={() => setMenu(false)}>
          <div className="lz-menu" onClick={(e) => e.stopPropagation()}>
            <div className="h2" style={{ margin: '0 0 10px' }}>Agregar caja</div>
            {ORDEN_MENU.map((t) => (
              <button key={t} className="lz-menu-it" onClick={() => agregar(t)}>
                <span className="lz-menu-ic">{DEF[t].icono}</span>
                <span><b>{DEF[t].titulo}</b>{DEF[t].ia ? <i className="lz-tag">IA</i> : null}<br /><span className="sub" style={{ fontSize: 12 }}>{DEF[t].desc}</span></span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ===================== Contenido de cada caja ===================== */
function CuerpoNodo(p: {
  n: Nodo;
  setData: (id: string, patch: Record<string, unknown>) => void;
  modelas: ModeloLz[];
  vestidos: { id: string; url: string; nombre?: string }[];
  galeria: { url: string }[];
  galerias: Record<string, { url: string }[]>;
  entradas: (puerto: string) => Nodo[];
  salidaDe: (n: Nodo) => Salida | null;
  costo: (clave: string) => number | null;
  claveFoto: (modelo: string) => string;
  correrFoto: () => void;
  correrMotion: () => void;
  correrHablar: () => void;
  onPublicar: (url: string, tipo: 'foto' | 'video') => void;
  onGuardar: (url: string, tipo: 'foto' | 'video') => void;
  conectadaASalida: boolean;
}) {
  const { n, setData } = p;
  const d = n.data;
  const set = (patch: Record<string, unknown>) => setData(n.id, patch);
  const err = typeof d.error === 'string' && d.error ? <p className="lz-err">{d.error}</p> : null;

  switch (n.tipo) {
    case 'video': return <CajaVideo d={d} set={set} />;
    case 'captura': return <CajaCaptura d={d} set={set} videoUrl={(() => { const s = p.entradas('video').map(p.salidaDe)[0]; return s?.tipo === 'video' ? s.url : ''; })()} />;
    case 'modelo': {
      const m = p.modelas.find((x) => x.id === d.modeloId) ?? p.modelas[0];
      return (
        <>
          <select className="input lz-input" value={m?.id ?? ''} onChange={(e) => set({ modeloId: e.target.value })}>
            {p.modelas.map((x) => <option key={x.id} value={x.id}>{x.nombre || 'Sin nombre'}</option>)}
          </select>
          <div className="lz-thumbs">
            {(m?.refs ?? []).map((u) => <span key={u} className="lz-th"><Image src={u} alt="" fill sizes="60px" /></span>)}
            {d.cuerpo !== false && (m?.entero || m?.medio) ? <span className="lz-th"><Image src={(m.entero || m.medio)!} alt="" fill sizes="60px" /></span> : null}
          </div>
          {!m?.refs.length ? <p className="lz-err">Esta modelo no tiene fotos de cara. Cargalas en su ficha.</p> : null}
          {m?.entero || m?.medio ? (
            <label className="lz-ck"><input type="checkbox" checked={d.cuerpo !== false} onChange={(e) => set({ cuerpo: e.target.checked })} /> Incluir foto de cuerpo</label>
          ) : null}
          {m?.cuerpo ? <p className="lz-nota">Medidas: {m.cuerpo}</p> : null}
        </>
      );
    }
    case 'vestuario': return <CajaElegirImagen d={d} set={set} opciones={p.vestidos.map((v) => v.url)} vacio="Elegí un vestuario o subí uno" />;
    case 'escena': case 'peinado': case 'pose': {
      const op = (p.galerias[GALERIA_DE[n.tipo] ?? ''] ?? []).map((g) => g.url);
      const nombre = n.tipo === 'escena' ? 'una escena' : n.tipo === 'peinado' ? 'un peinado' : 'una pose';
      return <CajaElegirImagen d={d} set={set} opciones={op} vacio={op.length ? `Elegí ${nombre} de tu galería o subí una foto` : `Subí una foto con ${nombre} (o cargalas en Crear → galerías)`} />;
    }
    case 'imagen': return <CajaElegirImagen d={d} set={set} opciones={p.galeria.slice(0, 18).map((g) => g.url)} vacio="Subí una foto o elegila de tu galería" />;
    case 'prompt':
      return <textarea className="textarea lz-input" value={(d.texto as string) ?? ''} onChange={(e) => set({ texto: e.target.value })} placeholder="Ej: con el pelo recogido, mirando a cámara, sonriendo" style={{ height: 90 }} />;
    case 'foto': {
      const corriendo = d.estado === 'corriendo';
      const res = (d.resultados as string[]) ?? [];
      const conectadas = p.entradas('imgs').length;
      return (
        <>
          <div className="lz-dos">
            <select className="input lz-input" value={(d.modelo as string) || 'seedream'} onChange={(e) => set({ modelo: e.target.value })}>
              {FOTO_MODELOS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
            <select className="input lz-input" value={(d.aspect as string) || 'auto'} onChange={(e) => set({ aspect: e.target.value })}>
              {FORMATOS.map((f) => <option key={f} value={f}>{f === 'auto' ? 'Formato: auto' : f}</option>)}
            </select>
          </div>
          <button className={`btn-grad lz-run ${corriendo ? 'busy' : ''}`} disabled={corriendo || !conectadas} onClick={p.correrFoto}>
            {corriendo ? <><span className="gen-ring lz-ring" /> Creando…</> : res.length ? '🔄 Crear otra' : '▶ Crear foto'}
          </button>
          <p className="lz-nota">{conectadas ? `${conectadas} caja${conectadas > 1 ? 's' : ''} conectada${conectadas > 1 ? 's' : ''} · ` : 'Conectá imágenes · '}{costoTxt(p.costo(p.claveFoto((d.modelo as string) || 'seedream')))}</p>
          {err}
          {res.length ? (
            <>
              <div className="lz-res">
                {res.map((u) => (
                  <button key={u} className={`lz-resit ${d.elegida === u ? 'on' : ''}`} onClick={() => set({ elegida: d.elegida === u ? '' : u })}>
                    <Image src={u} alt="" fill sizes="110px" />
                    <span className="lz-ok">{d.elegida === u ? '✅ Aprobada' : 'Aprobar'}</span>
                  </button>
                ))}
              </div>
              <a className="lz-link" href={(d.ultimo as string) || res[0]} target="_blank" rel="noreferrer">Ver la última en grande ↗</a>
              {typeof d.credits === 'number' ? <p className="lz-nota">La última costó {fmt(d.credits as number)} créditos · {res.length} foto{res.length > 1 ? 's' : ''} creada{res.length > 1 ? 's' : ''} en esta caja.</p> : null}
              {!d.elegida ? <p className="lz-nota">👆 Tocá la que quieras usar para <b>aprobarla</b>: esa pasa a la caja siguiente.</p> : null}
            </>
          ) : null}
        </>
      );
    }
    case 'audio': return <CajaAudio d={d} set={set} />;
    case 'hablar': {
      const corriendo = d.estado === 'corriendo';
      const motor = (d.motor as string) || 'kling-std';
      const def = HABLAR.find((h) => h.id === motor) ?? HABLAR[0];
      const aud = p.entradas('audio').map(p.salidaDe)[0];
      const dur = aud?.tipo === 'audio' ? aud.dur ?? 0 : 0;
      const imgOk = !!p.entradas('imagen').map(p.salidaDe)[0];
      const estimado = dur ? Math.ceil(dur) * def.porSeg : null;
      return (
        <>
          <div className="lz-lista">
            {HABLAR.map((h) => (
              <button key={h.id} className={`lz-opc ${motor === h.id ? 'on' : ''}`} onClick={() => set({ motor: h.id })}>
                <b>{h.label}</b><span>{h.desc} · {h.porSeg} cr/s</span>
              </button>
            ))}
          </div>
          {dur > def.maxSeg ? <p className="lz-err">Tu audio dura {Math.round(dur)} s y este acepta hasta {def.maxSeg} s.</p> : null}
          <button className={`btn-grad lz-run ${corriendo ? 'busy' : ''}`} disabled={corriendo || !imgOk || !aud} onClick={p.correrHablar}>
            {corriendo ? <><span className="gen-ring lz-ring" /> Creando video…</> : '▶ Crear video hablando'}
          </button>
          <p className="lz-nota">
            {!imgOk ? 'Falta la foto. ' : ''}{!aud ? 'Falta el audio. ' : ''}
            {estimado !== null ? `≈ ${estimado} créditos (≈ US$ ${(estimado * 0.005).toFixed(2).replace('.', ',')}) por ${Math.ceil(dur)} s de audio.` : `${def.porSeg} créditos por segundo de audio.`}
          </p>
          {corriendo ? <p className="lz-nota">Tarda unos minutos. Podés seguir usando la app.</p> : null}
          {err}
          {typeof d.resultado === 'string' && d.resultado ? (
            p.conectadaASalida
              ? <p className="lz-ok-txt">✅ Video listo{typeof d.credits === 'number' ? ` · costó ${fmt(d.credits as number)} créditos` : ''}. Lo ves en la caja <b>Resultado</b>.</p>
              : <><video className="lz-vid" src={d.resultado} controls playsInline preload="metadata" />{typeof d.credits === 'number' ? <p className="lz-nota">Costó {fmt(d.credits as number)} créditos.</p> : null}</>
          ) : null}
        </>
      );
    }
    case 'motion': {
      const corriendo = d.estado === 'corriendo';
      const motor = (d.motor as string) || 'kling3';
      const cal = (d.calidad as string) || '720p';
      const calidades = motor === 'wan' ? ['480p', '720p'] : ['720p', '1080p'];
      const clave = motor === 'wan' ? `wan/2-2-animate-replace|${cal}` : `${motor === 'kling26' ? 'kling-2.6' : 'kling-3.0'}/motion-control|${cal}`;
      const vid = p.entradas('video').map(p.salidaDe)[0];
      const dur = vid?.tipo === 'video' ? vid.dur ?? 0 : 0;
      const imgOk = !!p.entradas('imagen').map(p.salidaDe)[0];
      return (
        <>
          <div className="lz-chips">
            {[['kling3', 'Kling 3.0 ⭐'], ['kling26', 'Kling 2.6'], ['wan', 'Reemplazar']].map(([id, l]) => (
              <button key={id} className={`opt ${motor === id ? 'on' : ''}`} onClick={() => set({ motor: id, calidad: id === 'wan' ? (cal === '1080p' ? '720p' : cal) : (cal === '480p' ? '720p' : cal) })}>{l}</button>
            ))}
          </div>
          <div className="lz-chips">
            {calidades.map((c) => <button key={c} className={`opt ${cal === c ? 'on' : ''}`} onClick={() => set({ calidad: c })}>{c}</button>)}
          </div>
          {motor !== 'wan' ? (
            <div className="lz-chips">
              <button className={`opt ${(d.orientacion ?? 'video') === 'video' ? 'on' : ''}`} onClick={() => set({ orientacion: 'video' })}>Seguir el video</button>
              <button className={`opt ${d.orientacion === 'image' ? 'on' : ''}`} onClick={() => set({ orientacion: 'image' })}>Como la foto</button>
            </div>
          ) : null}
          <p className="lz-nota">
            {motor === 'kling3' ? 'El más fiel. Hasta 30 s.' : motor === 'kling26' ? 'Más barato. Hasta 10 s.' : 'Deja el video original y cambia a la persona. Video de hasta 10 MB.'}
            {motor === 'kling26' && dur > 10 ? ' ⚠️ Tu video dura más de 10 s: sale cortado.' : ''}
          </p>
          <button className={`btn-grad lz-run ${corriendo ? 'busy' : ''}`} disabled={corriendo || !imgOk || !vid} onClick={p.correrMotion}>
            {corriendo ? <><span className="gen-ring lz-ring" /> Creando video…</> : '▶ Crear video'}
          </button>
          <p className="lz-nota">{!imgOk ? 'Falta la imagen inicial (aprobada). ' : ''}{!vid ? 'Falta el video. ' : ''}Último video: {costoTxt(p.costo(clave))}</p>
          {corriendo ? <p className="lz-nota">Tarda unos minutos. Podés seguir usando la app.</p> : null}
          {err}
          {typeof d.resultado === 'string' && d.resultado ? (
            p.conectadaASalida
              // Es el MISMO video que muestra la caja Resultado (no se cobró dos veces).
              ? <p className="lz-ok-txt">✅ Video listo{typeof d.credits === 'number' ? ` · costó ${fmt(d.credits as number)} créditos` : ''}. Lo ves en la caja <b>Resultado</b>.</p>
              : <>
                  <video className="lz-vid" src={d.resultado} controls playsInline preload="metadata" />
                  {typeof d.credits === 'number' ? <p className="lz-nota">Costó {fmt(d.credits as number)} créditos.</p> : null}
                </>
          ) : null}
        </>
      );
    }
    case 'resultado': {
      const s = p.entradas('in').map(p.salidaDe)[0];
      const url = s ? (s.tipo === 'video' ? s.url : s.tipo === 'imagen' ? s.items[0]?.url : '') : '';
      if (!s || !url) return <p className="lz-nota">Conectá una caja Motion Control o Foto IA. Cuando termine, aparece acá.</p>;
      const esVideo = s.tipo === 'video';
      return (
        <>
          {esVideo ? <video className="lz-vid" src={url} controls playsInline preload="metadata" /> : <span className="lz-big"><Image src={url} alt="" fill sizes="230px" /></span>}
          <div className="lz-dos" style={{ marginTop: 8 }}>
            <button className="btn-soft" onClick={() => p.onGuardar(url, esVideo ? 'video' : 'foto')}>⬇ Guardar</button>
            <button className="btn-grad" onClick={() => p.onPublicar(url, esVideo ? 'video' : 'foto')}>📤 Publicar</button>
          </div>
        </>
      );
    }
    default: return null;
  }
}

function CajaVideo({ d, set }: { d: Record<string, unknown>; set: (p: Record<string, unknown>) => void }) {
  const [sub, setSub] = useState(0);
  const [quitando, setQuitando] = useState(false);
  const [roto, setRoto] = useState(false);
  const sinSonido = d.conSonido !== true;
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    if (f.size > 100 * 1024 * 1024) { set({ error: 'El video pesa más de 100 MB.' }); return; }
    const dur = await metaVideo(f);
    if (dur && dur < 3) { set({ error: 'El video tiene que durar al menos 3 segundos.' }); return; }
    if (dur > 30.5) { set({ error: `Dura ${Math.round(dur)} s y el máximo es 30. Recortalo.` }); return; }
    setSub(1); setRoto(false);
    let fin = false;
    try {
      const ext = (f.name.split('.').pop() || 'mp4').toLowerCase();
      const tipo = f.type || (ext === 'mov' ? 'video/quicktime' : 'video/mp4');
      const blob = await upload(`motion/lienzo.${ext}`, f, {
        access: 'public', handleUploadUrl: '/api/upload-video', contentType: tipo, multipart: f.size > 8 * 1024 * 1024,
        onUploadProgress: (pr) => { if (!fin) setSub(Math.min(99, Math.max(1, Math.round(pr.percentage)))); },
      });
      fin = true;
      let final = { url: blob.url, mb: f.size / (1024 * 1024), mudo: false, error: '' };
      if (sinSonido) {
        setSub(0); setQuitando(true);
        try { const r = await quitarSonido(blob.url); final = { url: r.url, mb: r.mb || final.mb, mudo: true, error: '' }; }
        catch (er) { final.error = `Se subió CON sonido: ${er instanceof Error ? er.message : 'no se pudo quitar'}.`; }
        finally { setQuitando(false); }
      }
      set({ url: final.url, dur, mb: final.mb, mudo: final.mudo, error: final.error });
    } catch (er) {
      set({ error: er instanceof Error && er.message ? `No se pudo subir: ${er.message}` : 'No se pudo subir el video.' });
    } finally { fin = true; setSub(0); }
  }
  const url = typeof d.url === 'string' ? d.url : '';
  return (
    <>
      {url && !roto ? <video className="lz-vid" src={url} controls muted playsInline preload="metadata" onError={() => setRoto(true)} /> : null}
      {roto ? <p className="lz-err">Este video ya se borró (duran 3 días). Subilo de nuevo.</p> : null}
      <label className="btn-soft lz-file">
        <input type="file" accept="video/mp4,video/quicktime,video/webm,video/*" onChange={onFile} style={{ display: 'none' }} disabled={sub > 0 || quitando} />
        {quitando ? '🔇 Quitando el sonido…' : sub ? `Subiendo… ${sub}%` : url ? '🔄 Cambiar video' : '⬆ Subir video'}
      </label>
      <label className="lz-ck"><input type="checkbox" checked={sinSonido} onChange={(e) => set({ conSonido: !e.target.checked })} /> 🔇 Quitar el sonido al subir</label>
      {url && typeof d.dur === 'number' ? <p className="lz-nota">{Math.round(d.dur as number)} s · {fmt((d.mb as number) ?? 0)} MB{d.mudo ? ' · 🔇 sin sonido' : ''}</p> : <p className="lz-nota">De 3 a 30 segundos. Una sola persona, bien visible.</p>}
      {typeof d.error === 'string' && d.error ? <p className="lz-err">{d.error}</p> : null}
    </>
  );
}

function CajaCaptura({ d, set, videoUrl }: { d: Record<string, unknown>; set: (p: Record<string, unknown>) => void; videoUrl: string }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [dur, setDur] = useState(0);
  const [t, setT] = useState(typeof d.t === 'number' ? (d.t as number) : 0);
  const [subiendo, setSubiendo] = useState(false);
  const [fallo, setFallo] = useState('');
  if (!videoUrl) return <p className="lz-nota">Conectá una caja <b>Video</b> a “Video”. Después elegís el momento exacto.</p>;
  async function capturar() {
    const v = ref.current;
    if (!v || !v.videoWidth) { setFallo('El video todavía no cargó. Esperá un segundo.'); return; }
    setSubiendo(true); setFallo('');
    try {
      const k = Math.min(1, 1440 / Math.max(v.videoWidth, v.videoHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k);
      c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height);
      const b: Blob | null = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92));
      if (!b) throw new Error();
      const url = await subirImagen(new File([b], 'captura.jpg', { type: 'image/jpeg' }));
      set({ url, t, asp: aspecto(v.videoWidth, v.videoHeight), error: '' });
    } catch { setFallo('No pude tomar la captura en este celu. Subí una captura de pantalla con el botón de abajo.'); } finally { setSubiendo(false); }
  }
  async function subirManual(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    setSubiendo(true);
    try { set({ url: await subirImagen(f), asp: '', error: '' }); } catch { setFallo('No se pudo subir la captura.'); } finally { setSubiendo(false); }
  }
  return (
    <>
      <video
        ref={ref} className="lz-vid" crossOrigin="anonymous" src={videoUrl} muted playsInline preload="auto"
        onLoadedMetadata={(e) => { const v = e.currentTarget; setDur(v.duration || 0); if (t) v.currentTime = Math.min(t, v.duration || t); }}
        onError={() => setFallo('No se pudo cargar el video (¿se borró? duran 3 días).')}
      />
      <input
        type="range" className="lz-slider" min={0} max={Math.max(0.1, dur - 0.05)} step={0.05} value={Math.min(t, dur || t)}
        onChange={(e) => { const x = Number(e.target.value); setT(x); if (ref.current) ref.current.currentTime = x; }}
      />
      <p className="lz-nota">Momento: <b>{t.toFixed(1)} s</b>{dur ? ` de ${dur.toFixed(1)} s` : ''}</p>
      <button className="btn-grad lz-run" disabled={subiendo} onClick={capturar}>{subiendo ? 'Guardando…' : '📸 Usar este momento'}</button>
      {typeof d.url === 'string' && d.url ? (
        <div className="lz-cap"><span className="lz-th"><Image src={d.url} alt="" fill sizes="60px" /></span><span className="lz-nota">✓ Captura lista{typeof d.t === 'number' ? ` (${(d.t as number).toFixed(1)} s)` : ''}</span></div>
      ) : null}
      <label className="lz-link" style={{ cursor: 'pointer' }}>
        <input type="file" accept="image/*" onChange={subirManual} style={{ display: 'none' }} />o subir una captura a mano
      </label>
      {fallo ? <p className="lz-err">{fallo}</p> : null}
    </>
  );
}

function CajaElegirImagen({ d, set, opciones, vacio }: { d: Record<string, unknown>; set: (p: Record<string, unknown>) => void; opciones: string[]; vacio: string }) {
  const [subiendo, setSubiendo] = useState(false);
  const [ver, setVer] = useState(false);
  const url = typeof d.url === 'string' ? d.url : '';
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    setSubiendo(true);
    try { set({ url: await subirImagen(f), error: '' }); } catch (er) { set({ error: er instanceof Error ? er.message : 'No se pudo subir.' }); } finally { setSubiendo(false); }
  }
  return (
    <>
      {url ? <span className="lz-big chico"><Image src={url} alt="" fill sizes="230px" /></span> : <p className="lz-nota">{vacio}</p>}
      <div className="lz-dos">
        <label className="btn-soft lz-file">
          <input type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} disabled={subiendo} />
          {subiendo ? 'Subiendo…' : '⬆ Subir'}
        </label>
        {opciones.length ? <button className="btn-soft" onClick={() => setVer((x) => !x)}>{ver ? 'Cerrar' : `Elegir (${opciones.length})`}</button> : null}
      </div>
      {ver ? (
        <div className="lz-grid">
          {opciones.map((u) => (
            <button key={u} className={`lz-th ${u === url ? 'on' : ''}`} onClick={() => { set({ url: u, error: '' }); setVer(false); }}>
              <Image src={u} alt="" fill sizes="70px" />
            </button>
          ))}
        </div>
      ) : null}
      {typeof d.error === 'string' && d.error ? <p className="lz-err">{d.error}</p> : null}
    </>
  );
}

function CajaAudio({ d, set }: { d: Record<string, unknown>; set: (p: Record<string, unknown>) => void }) {
  const [sub, setSub] = useState(0);
  const [sacando, setSacando] = useState(false);
  const [mis, setMis] = useState<{ url: string; ts: number }[] | null>(null);
  const [ver, setVer] = useState(false);
  const url = typeof d.url === 'string' ? d.url : '';
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    if (f.size > 100 * 1024 * 1024) { set({ error: 'El archivo pesa más de 100 MB.' }); return; }
    setSub(1);
    let fin = false;
    try {
      const ext = (f.name.split('.').pop() || 'mp4').toLowerCase();
      const tipo = f.type || (ext === 'mov' ? 'video/quicktime' : ext === 'mp3' ? 'audio/mpeg' : ext === 'm4a' ? 'audio/mp4' : ext === 'wav' ? 'audio/wav' : 'video/mp4');
      const blob = await upload(`motion/voz.${ext}`, f, {
        access: 'public', handleUploadUrl: '/api/upload-video', contentType: tipo, multipart: f.size > 8 * 1024 * 1024,
        onUploadProgress: (pr) => { if (!fin) setSub(Math.min(99, Math.max(1, Math.round(pr.percentage)))); },
      });
      fin = true; setSub(0); setSacando(true);
      // Sea video (ej. de Flow) o audio: el servidor saca la voz y la deja en MP3.
      const res = await fetch('/api/extraer-audio', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: blob.url }) });
      const r = await res.json().catch(() => ({}));
      if (!res.ok || !r.url) throw new Error(r.error ?? 'No se pudo sacar el audio.');
      set({ url: r.url, dur: r.dur, nombre: f.name, error: '' });
    } catch (er) {
      set({ error: er instanceof Error && er.message ? er.message : 'No se pudo subir.' });
    } finally { fin = true; setSub(0); setSacando(false); }
  }
  async function abrirMis() {
    setVer((x) => !x);
    if (mis) return;
    try { const r = await fetch('/api/voz').then((x) => x.json()); setMis(Array.isArray(r.items) ? r.items : []); } catch { setMis([]); }
  }
  function elegir(u: string) {
    const a = new Audio(); a.preload = 'metadata';
    a.onloadedmetadata = () => set({ url: u, dur: Number.isFinite(a.duration) ? a.duration : 0, nombre: 'De Mis audios', error: '' });
    a.onerror = () => set({ url: u, dur: 0, nombre: 'De Mis audios', error: '' });
    a.src = u; setVer(false);
  }
  return (
    <>
      {url ? <audio className="lz-aud" src={url} controls preload="metadata" /> : <p className="lz-nota">Subí un <b>audio</b> o un <b>video</b> (por ejemplo de Flow con Mila hablando): la app le saca la voz.</p>}
      {url ? <p className="lz-nota">{typeof d.nombre === 'string' ? d.nombre : 'Audio'}{typeof d.dur === 'number' && d.dur ? ` · ${Math.round(d.dur as number)} s` : ''}</p> : null}
      <div className="lz-dos">
        <label className="btn-soft lz-file" style={{ marginTop: 0 }}>
          <input type="file" accept="audio/*,video/mp4,video/quicktime,video/webm" onChange={onFile} style={{ display: 'none' }} disabled={sub > 0 || sacando} />
          {sacando ? '🎵 Sacando la voz…' : sub ? `Subiendo… ${sub}%` : url ? '🔄 Cambiar' : '⬆ Subir'}
        </label>
        <button className="btn-soft" onClick={abrirMis}>{ver ? 'Cerrar' : 'Mis audios'}</button>
      </div>
      {ver ? (
        <div className="lz-mis">
          {mis === null ? <p className="lz-nota">Cargando…</p> : !mis.length ? <p className="lz-nota">Todavía no tenés audios en la sección Voz.</p> : mis.slice(0, 12).map((a) => (
            <button key={a.url} className="lz-opc" onClick={() => elegir(a.url)}><b>🎵 Audio del {new Date(a.ts).toLocaleDateString()}</b><span>Tocá para usarlo</span></button>
          ))}
        </div>
      ) : null}
      {typeof d.error === 'string' && d.error ? <p className="lz-err">{d.error}</p> : null}
    </>
  );
}
