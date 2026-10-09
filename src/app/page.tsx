'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { upload } from '@vercel/blob/client';

import { componerCambioAvatar, componerSesion, componerUnificado, pistaCuerpo, TOMAS_SESION, type Encuadre } from '@/lib/estudio/prompt';
import { CATEGORIAS, type Selecciones } from '@/lib/estudio/piezas';
import { GALERIAS } from '@/lib/estudio/galerias';
import { MODELOS, type ModeloId } from '@/lib/ia/models';

type Personaje = { id: string; nombre: string; refs: string[]; cuerpo?: string };
const SIN_MODELO: Personaje = { id: '', nombre: '', refs: [] };
type Item = { id: string; url: string; nombre?: string };
type Creacion = { id: string; url: string; ts: number; prompt?: string; modelo?: string; refs?: string[]; aspect?: string; credits?: number };
type Phase = 'idle' | 'creating' | 'polling' | 'done' | 'error';
type Vista = 'crear' | 'galeria' | 'voz' | 'motion';

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

  const [modelas, setModelas] = useState<Personaje[]>([]);
  const [activoId, setActivoId] = useState('');
  const personaje = modelas.find((m) => m.id === activoId) ?? modelas[0] ?? SIN_MODELO;
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
  // Créditos de Kie: saldo de la cuenta y último costo real de cada tipo de generación.
  const [saldo, setSaldo] = useState<number | null>(null);
  const [costos, setCostos] = useState<Record<string, { credits: number }>>({});
  const [costoMsg, setCostoMsg] = useState('');
  const [espacio, setEspacio] = useState<{ total: number; carpetas: Record<string, number>; archivos: number } | null>(null);
  // Al entrar a la Galería consultamos cuánto espacio se está usando.
  useEffect(() => {
    if (vista !== 'galeria') return;
    fetch('/api/espacio').then((r) => (r.ok ? r.json() : null)).then((d) => { if (d && typeof d.total === 'number') setEspacio(d); }).catch(() => undefined);
  }, [vista, creaciones.length, videos.length]);
  async function cargarSaldo() {
    try {
      const d = await fetch('/api/saldo').then((r) => r.json());
      if (typeof d.credits === 'number') setSaldo(d.credits);
      if (d.costos && typeof d.costos === 'object') setCostos(d.costos);
    } catch { /* sin saldo */ }
  }
  /** Último costo conocido (en créditos) de un tipo de generación, o null. */
  function costoDe(clave: string): number | null {
    const c = costos[clave]?.credits;
    return typeof c === 'number' ? c : null;
  }
  function claveFoto(id: ModeloId): string {
    const m = MODELOS.find((x) => x.id === id) ?? MODELOS[0];
    const e = m.extra('3:4');
    const cal = e.mode ?? e.resolution ?? e.quality;
    return `${m.kieModel}|${typeof cal === 'string' ? cal : ''}`;
  }
  // Motion control: video de referencia + foto de la modelo.
  const [mModo, setMModo] = useState<'mover' | 'reemplazar'>('mover');
  // Cómo se ve la persona en el video de referencia (para que la foto coincida).
  const [mEncuadre, setMEncuadre] = useState<Encuadre | ''>('');
  const [mAdaptar, setMAdaptar] = useState(false);
  const [mVideo, setMVideo] = useState<{ url: string; dur: number; mb: number } | null>(null);
  const [mFoto, setMFoto] = useState<string | null>(null);
  const [mOri, setMOri] = useState<'video' | 'image'>('video');
  const [mCal, setMCal] = useState<'480p' | '720p' | '1080p'>('720p');
  const [mTxt, setMTxt] = useState('');
  const [mSubiendo, setMSubiendo] = useState(0); // % de subida del video (0 = no está subiendo)
  const [mSubiendoFoto, setMSubiendoFoto] = useState(false);
  const [mError, setMError] = useState('');
  const [copiado, setCopiado] = useState(false);
  const [linkCopiado, setLinkCopiado] = useState(false);
  /** Copia un link al portapapeles (con plan B para navegadores que no dejan). */
  async function copiarLink(url: string) {
    let ok = false;
    try { await navigator.clipboard.writeText(url); ok = true; } catch { /* plan B */ }
    if (!ok) {
      try {
        const t = document.createElement('textarea');
        t.value = url; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
        document.body.appendChild(t); t.select(); t.setSelectionRange(0, url.length);
        ok = document.execCommand('copy');
        document.body.removeChild(t);
      } catch { ok = false; }
    }
    setLinkCopiado(ok);
    if (ok) setTimeout(() => setLinkCopiado(false), 2500);
    return ok;
  }

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
  // Créditos ya gastados en un paso previo del mismo video (foto con cambios de Motion).
  const costoPrevio = useRef(0);
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
        if (p && Array.isArray(p.lista)) { setModelas(p.lista); setActivoId(p.activo ?? p.lista[0]?.id ?? ''); }
        if (v && Array.isArray(v.items)) setVestidos(v.items);
        if (c && Array.isArray(c.items)) setCreaciones(c.items);
        try { const vd = await fetch('/api/videos').then((r) => r.json()); if (Array.isArray(vd.items)) setVideos(vd.items); } catch { /* */ }
        cargarSaldo();
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

  async function guardarModelas(lista: Personaje[], activo: string) {
    setModelas(lista); setActivoId(activo);
    try { await fetch('/api/personaje', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ activo, lista }) }); } catch { /* */ }
  }
  async function guardarPersonaje(next: Personaje) {
    const existe = modelas.some((m) => m.id === next.id);
    if (existe) { await guardarModelas(modelas.map((m) => (m.id === next.id ? next : m)), activoId || next.id); return; }
    const fija = { ...next, id: next.id || 'p1' };
    await guardarModelas([...modelas, fija], fija.id);
  }
  /** Tocar una modelo: si no está elegida la elige; si ya lo está, abre su ficha. */
  function tocarModelo(id: string) {
    if (id === personaje.id) { setAbierto('personaje'); return; }
    guardarModelas(modelas, id);
  }
  function nuevaModelo() {
    const nueva: Personaje = { id: `p${Date.now().toString(36)}`, nombre: '', refs: [] };
    guardarModelas([...modelas, nueva], nueva.id);
    setAbierto('personaje');
  }
  function borrarModelo() {
    if (modelas.length < 2) return;
    if (!window.confirm(`¿Eliminar a ${personaje.nombre || 'esta modelo'}? Sus fotos creadas quedan en la galería.`)) return;
    const resto = modelas.filter((m) => m.id !== personaje.id);
    guardarModelas(resto, resto[0].id);
    setAbierto(null);
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

  /**
   * Lanza generaciones en paralelo y las va mostrando. Con un solo prompt hace
   * tantas copias como "cantidad"; con una lista (sesión de fotos) hace un
   * pedido por cada prompt.
   */
  async function lanzar(prompt: string | string[], imageUrls: string[], meta: GenMeta, aviso?: string) {
    setAbierto(null); setError(''); setResultUrls([]); setCostoMsg('');
    pollTimers.current.forEach(clearTimeout); pollTimers.current.clear();
    setPhase('creating'); setStatusMsg('Enviando el pedido a la IA…');
    const prompts = Array.isArray(prompt) ? prompt : Array.from({ length: Math.max(1, Math.min(4, cantidad)) }, () => prompt);
    const tareas: { id: string; prompt: string }[] = [];
    let ultimoError = '';
    // Los pedidos salen todos a la vez (antes iban de a uno).
    await Promise.all(prompts.map(async (pr) => {
      try {
        const res = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: pr, imageUrls, aspect: meta.aspect, modelo: meta.modelo }) });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.taskId) tareas.push({ id: data.taskId, prompt: pr });
        else ultimoError = data.error ?? 'No se pudo crear la generación.';
      } catch { ultimoError = 'No se pudo conectar. Probá de nuevo.'; }
    }));
    if (!tareas.length) { setError(ultimoError || 'No se pudo crear la generación.'); setPhase('error'); return; }
    setPhase('polling'); setStatusMsg(aviso ?? `Generando ${tareas.length} ${tareas.length > 1 ? 'opciones' : 'imagen'}… (puede tardar ~1 minuto)`);
    let remaining = tareas.length;
    let gotAny = false;
    let gastado = 0;
    let fotosOk = 0;
    const finishOne = (ok: boolean, credits?: number) => {
      if (ok) { gotAny = true; fotosOk += 1; }
      if (typeof credits === 'number') gastado += credits;
      remaining -= 1;
      if (remaining <= 0) {
        setPhase('done'); setStatusMsg('');
        if (!gotAny) setError((p) => p || 'No salió ninguna imagen. Probá de nuevo.');
        if (gastado > 0) setCostoMsg(`💳 ${fotosOk} ${fotosOk === 1 ? 'foto' : 'fotos'} · costó ${fmtCred(gastado)} créditos (≈ ${fmtUsd(gastado)})`);
        cargarSaldo();
      }
    };
    tareas.forEach((t) => pollOne(t.id, 0, t.prompt, imageUrls, meta, finishOne));
  }

  // Espera hasta ~10 minutos: Nano Banana Pro a veces tarda varios minutos
  // (antes cortábamos a los 2 y la foto se perdía aunque la IA la terminara).
  // Los primeros ~60s consulta cada 3s; después cada 6s.
  function pollOne(taskId: string, tries: number, prompt: string, imageUrls: string[], meta: GenMeta, done: (ok: boolean, credits?: number) => void) {
    if (tries > 110) { setError('La IA tardó más de 10 minutos. Probá de nuevo o con otro modelo.'); done(false); return; }
    if (tries === 30) setStatusMsg('La IA está tardando más de lo normal… seguimos esperando (Nano Banana Pro a veces se demora unos minutos).');
    schedulePoll(async () => {
      try {
        const res = await fetch(`/api/status?taskId=${encodeURIComponent(taskId)}`);
        const data = await res.json().catch(() => ({}));
        if (data.state === 'success') {
          const u = data.url as string | undefined;
          const credits = typeof data.credits === 'number' ? (data.credits as number) : undefined;
          if (u) {
            setResultUrls((prev) => (prev.includes(u) ? prev : [...prev, u]));
            setCreaciones((prev) => [{ id: u, url: u, ts: Date.now(), prompt, modelo: meta.modelo, refs: imageUrls, aspect: meta.aspect, credits }, ...prev.filter((c) => c.url !== u)]);
            fetch('/api/meta', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: u, prompt, modelo: meta.modelo, refs: imageUrls, aspect: meta.aspect, credits }) }).catch(() => undefined);
          }
          done(!!u, credits); return;
        }
        if (data.state === 'fail' || (!res.ok && data.error)) { done(false); return; }
        pollOne(taskId, tries + 1, prompt, imageUrls, meta, done);
      } catch { pollOne(taskId, tries + 1, prompt, imageUrls, meta, done); }
    }, tries < 20 ? 3000 : 6000);
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
    const cuerpoHint = pistaCuerpo(personaje.cuerpo);
    const hints = [...faceHint, ...(cuerpoHint ? [cuerpoHint] : []), ...refsExtra.map((r) => r.hint)];
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

  /**
   * Sesión de fotos: 4 tomas nuevas del mismo escenario y vestuario de una foto.
   * Usa la foto como image 1 y las caras de la modelo que salía en ella (si no
   * se sabe, la modelo elegida).
   */
  function sesionDeFotos(c: Creacion) {
    if (busy) return;
    const deLaFoto = modelas.find((m) => m.refs.some((u) => c.refs?.includes(u)));
    const modeloFoto = deLaFoto ?? personaje;
    const caras = modeloFoto.refs;
    const a = c.aspect || aspect;
    setLightbox(null); setVista('crear'); setAspect(a);
    lanzar(
      TOMAS_SESION.map((t) => componerSesion(t, caras.length > 0, modeloFoto.cuerpo)),
      [c.url, ...caras],
      { aspect: a, modelo },
      `📸 Sesión de fotos: generando ${TOMAS_SESION.length} tomas del mismo set… (puede tardar ~1 minuto)`,
    );
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
    // Hasta ~15 min: los videos (sobre todo Motion de 30 s) pueden tardar bastante.
    if (tries > 120) { setError('El video tardó demasiado. Probá de nuevo.'); setHaciendoVideo(null); setVidMsg(''); return; }
    vidTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/status?taskId=${encodeURIComponent(taskId)}`);
        const data = await res.json().catch(() => ({}));
        if (data.state === 'success') {
          if (data.url) setVideos((prev) => [{ id: data.url as string, url: data.url as string, ts: Date.now() }, ...prev.filter((x) => x.url !== data.url)]);
          const extra = costoPrevio.current; costoPrevio.current = 0;
          const total = (typeof data.credits === 'number' ? data.credits : 0) + extra;
          if (total > 0) setCostoMsg(`💳 Video listo · costó ${fmtCred(total)} créditos (≈ ${fmtUsd(total)})${extra > 0 ? ', incluida la foto con los cambios' : ''}`);
          cargarSaldo();
          setHaciendoVideo(null); setVidMsg(''); setVista('galeria'); setGalTab('videos');
          return;
        }
        if (data.state === 'fail' || (!res.ok && data.error)) { setError(data.error ?? 'El video falló.'); setHaciendoVideo(null); setVidMsg(''); return; }
        pollVideo(taskId, tries + 1);
      } catch { pollVideo(taskId, tries + 1); }
    }, tries < 20 ? 3000 : 8000);
  }

  /* ----- Motion control ----- */
  function duracionDe(file: File): Promise<number> {
    return new Promise((resolve) => {
      const u = URL.createObjectURL(file);
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = () => { const d = v.duration; URL.revokeObjectURL(u); resolve(Number.isFinite(d) ? d : 0); };
      v.onerror = () => { URL.revokeObjectURL(u); resolve(0); };
      v.src = u;
    });
  }
  async function onSubirVideoMotion(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    setMError('');
    if (f.size > 100 * 1024 * 1024) { setMError('El video pesa más de 100 MB. Recortalo o grabalo en menor calidad y volvé a subirlo.'); return; }
    const dur = await duracionDe(f);
    if (dur && dur < 3) { setMError('El video tiene que durar al menos 3 segundos.'); return; }
    if (dur > 30.5) { setMError(`El video dura ${Math.round(dur)} segundos y el máximo es 30. Recortalo y volvé a subirlo.`); return; }
    setMSubiendo(1);
    // El aviso de progreso puede llegar DESPUÉS de terminar la subida: lo
    // ignoramos para que no quede trabado en "Subiendo…".
    let terminado = false;
    try {
      const ext = (f.name.split('.').pop() || 'mp4').toLowerCase();
      const tipo = f.type || (ext === 'mov' ? 'video/quicktime' : ext === 'webm' ? 'video/webm' : 'video/mp4');
      // Sube DIRECTO al almacenamiento (sin pasar por el servidor de la app).
      const blob = await upload(`motion/referencia.${ext}`, f, {
        access: 'public',
        handleUploadUrl: '/api/upload-video',
        contentType: tipo,
        multipart: f.size > 8 * 1024 * 1024,
        onUploadProgress: (p) => { if (!terminado) setMSubiendo(Math.min(99, Math.max(1, Math.round(p.percentage)))); },
      });
      terminado = true;
      setMVideo({ url: blob.url, dur, mb: f.size / (1024 * 1024) });
    } catch (err) {
      setMError(err instanceof Error && err.message ? `No se pudo subir el video: ${err.message}` : 'No se pudo subir el video. Probá de nuevo.');
    } finally { terminado = true; setMSubiendo(0); }
  }
  async function onSubirFotoMotion(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    setMError(''); setMSubiendoFoto(true);
    try { setMFoto(await subir(f, 'refs')); }
    catch (err) { setMError(err instanceof Error ? err.message : 'No se pudo subir la foto.'); }
    finally { setMSubiendoFoto(false); }
  }
  // "Reemplazar en el video" (Wan) acepta videos de hasta 10 MB.
  const mPesado = mModo === 'reemplazar' && !!mVideo && mVideo.mb > 10;
  function elegirModoMotion(m: 'mover' | 'reemplazar') {
    setMModo(m); setMError('');
    setMCal('720p');
  }
  /** Relación de aspecto (de las que acepta Seedream) más parecida a la de una foto. */
  function aspectoDe(url: string): Promise<string> {
    const c = creaciones.find((x) => x.url === url);
    if (c?.aspect) return Promise.resolve(c.aspect);
    return new Promise((resolve) => {
      const im = new window.Image();
      im.onload = () => {
        const r = im.naturalWidth / Math.max(1, im.naturalHeight);
        const ops: [string, number][] = [['9:16', 9 / 16], ['3:4', 3 / 4], ['1:1', 1], ['4:3', 4 / 3], ['16:9', 16 / 9]];
        resolve(ops.reduce((a, b) => (Math.abs(b[1] - r) < Math.abs(a[1] - r) ? b : a))[0]);
      };
      im.onerror = () => resolve('3:4');
      im.src = url;
    });
  }
  /** Espera a que termine una foto (hasta ~6 min). Devuelve su URL o tira error. */
  async function esperarFoto(taskId: string): Promise<{ url: string; credits?: number }> {
    for (let i = 0; i < 80; i++) {
      await new Promise((r) => setTimeout(r, i < 20 ? 3000 : 6000));
      try {
        const data = await fetch(`/api/status?taskId=${encodeURIComponent(taskId)}`).then((r) => r.json());
        if (data.state === 'success' && data.url) return { url: data.url as string, credits: typeof data.credits === 'number' ? data.credits : undefined };
        if (data.state === 'fail') throw new Error(data.error ?? 'No se pudo crear la foto con los cambios.');
      } catch (e) { if (e instanceof Error && e.message) throw e; }
    }
    throw new Error('La foto con los cambios tardó demasiado. Probá de nuevo.');
  }

  async function generarMotion() {
    if (haciendoVideo || !mVideo || !mFoto || mPesado || !mEncuadre) return;
    setMError(''); setError(''); setCostoMsg(''); setHaciendoVideo('motion');
    costoPrevio.current = 0;
    const instr = mTxt.trim();
    let foto = mFoto;
    const deLaFoto = modelas.find((m) => m.refs.some((u) => creaciones.find((c) => c.url === mFoto)?.refs?.includes(u)));
    const modeloFoto = deLaFoto ?? personaje;
    try {
      // Paso 1 (si hay instrucciones o se pidió adaptar el encuadre): foto nueva del avatar.
      if (instr || mAdaptar) {
        setVidMsg(`✍️ Paso 1 de 2: preparando la foto de tu avatar${mAdaptar ? ' con el encuadre del video' : ''}${instr ? ' con los cambios' : ''}… (~1 min)`);
        const caras = modeloFoto.refs;
        const prompt = componerCambioAvatar(instr, caras.length > 0, { cuerpo: modeloFoto.cuerpo, encuadre: mAdaptar ? mEncuadre : undefined });
        const imageUrls = [mFoto, ...caras];
        const asp = await aspectoDe(mFoto);
        const res = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, imageUrls, aspect: asp, modelo: 'seedream' }) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.taskId) throw new Error(data.error ?? 'No se pudo crear la foto con los cambios.');
        const hecha = await esperarFoto(data.taskId);
        foto = hecha.url;
        costoPrevio.current = hecha.credits ?? 0;
        const nueva = foto;
        setCreaciones((prev) => [{ id: nueva, url: nueva, ts: Date.now(), prompt, modelo: 'seedream', refs: imageUrls, aspect: asp, credits: hecha.credits }, ...prev.filter((c) => c.url !== nueva)]);
        fetch('/api/meta', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: nueva, prompt, modelo: 'seedream', refs: imageUrls, aspect: asp, credits: hecha.credits }) }).catch(() => undefined);
        setMFoto(nueva);
      }
      setVidMsg(`🕺 ${instr || mAdaptar ? 'Paso 2 de 2: ' : ''}creando el video… Tarda unos minutos; podés seguir usando la app.`);
      const res = await fetch('/api/motion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modo: mModo, imageUrl: foto, videoUrl: mVideo.url, orientacion: mOri, calidad: mCal, cuerpo: modeloFoto.cuerpo }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.taskId) { setMError(data.error ?? 'No se pudo crear el video.'); setHaciendoVideo(null); setVidMsg(''); return; }
      pollVideo(data.taskId, 0);
    } catch (e) { setMError(e instanceof Error && e.message ? e.message : 'No se pudo conectar. Probá de nuevo.'); setHaciendoVideo(null); setVidMsg(''); }
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
        <button className={`rail-ic ${vista === 'motion' ? 'on' : ''}`} onClick={() => setVista('motion')}><Icon name="motion" /><span>Motion</span></button>
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
          <div className="stat"><b>{creaciones.length}</b> creaciones<br />{modeloLabel}{saldo !== null ? <><br /><span className="saldo">💳 <b>{fmtCred(saldo)}</b> créditos</span><br /><span className="saldo">≈ {fmtUsd(saldo)}</span></> : null}</div>
        </header>

        {cargando ? (
          <p className="sub">Cargando tu estudio…</p>
        ) : vista === 'crear' ? (
          <div className="aria">
            {/* ===== PANEL (como el "Crear Imagen" de Aria) ===== */}
            <div className="aria-panel">
              <div className="aria-pscroll">
                <div className="apchar">
                  <div className="aplb">PERSONAJE <span className="aphint">· tocá para elegir</span></div>
                  <div className="mrow">
                    {modelas.map((m) => (
                      <button key={m.id} className={`mchip ${m.id === personaje.id ? 'on' : ''}`} onClick={() => tocarModelo(m.id)} title={m.id === personaje.id ? 'Editar' : 'Elegir'}>
                        {m.refs[0] ? (
                          <span className="th"><Image src={m.refs[0]} alt="" fill sizes="36px" /></span>
                        ) : (
                          <span className="th"><Icon name="user" /></span>
                        )}
                        <span className="nm">{m.nombre || (m.refs.length ? 'Sin nombre' : 'Subí la cara')}</span>
                        {m.id === personaje.id ? <span className="ck">✓</span> : null}
                      </button>
                    ))}
                    <button className="mchip add" onClick={nuevaModelo} title="Agregar otra modelo">
                      <span className="plus">＋</span><span className="nm">Nueva</span>
                    </button>
                  </div>
                </div>

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
                {!busy ? <p className="costo">{costoTexto(costoDe(claveFoto(modelo)), cantidad, 'foto')}</p> : null}
                {statusMsg ? <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--violeta)' }}>{statusMsg}</p> : null}
                {costoMsg && vista === 'crear' ? <p className="costo ok">{costoMsg}</p> : null}
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
                    <button className="btn-grad shine sesion-btn" disabled={busy} onClick={() => sesionDeFotos(previewActual)}>
                      📸 Sesión de fotos <span className="sesion-n">{TOMAS_SESION.length} tomas</span>
                    </button>
                    <p className="costo" style={{ maxWidth: 250 }}>{costoTexto(costoDe(claveFoto(modelo)), TOMAS_SESION.length, 'toma')}</p>
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
        ) : vista === 'motion' ? (
          <>
            <h1 className="h1" style={{ marginBottom: 6 }}>🕺 Motion control</h1>
            <p className="sub" style={{ marginTop: 0, marginBottom: 14 }}>Copiá un baile, un trend o un gesto con tu modelo. Elegí cómo:</p>

            <div className="mmodos">
              <button className={`mmodo ${mModo === 'mover' ? 'on' : ''}`} onClick={() => elegirModoMotion('mover')}>
                <span className="mm-t">🕺 Mover mi foto</span>
                <span className="mm-d">Tu modelo hace los movimientos del video, en el escenario de tu foto. Kling 3.0.</span>
              </button>
              <button className={`mmodo ${mModo === 'reemplazar' ? 'on' : ''}`} onClick={() => elegirModoMotion('reemplazar')}>
                <span className="mm-t">🔁 Reemplazar en el video</span>
                <span className="mm-d">Queda el video original (lugar, cámara, luz) y la persona pasa a ser tu modelo. Ideal para replicar trends.</span>
              </button>
            </div>

            <div className="mtip">💡 <b>Clave para que salga bien:</b> usá una foto de tu modelo con el <b>mismo encuadre</b> que el video. Si el video es un baile de cuerpo entero, elegí una foto de cuerpo entero. Una sola persona en el video, bien visible.</div>

            <div className="panel" style={{ marginBottom: 14 }}>
              <div className="h2" style={{ marginBottom: 4 }}>1. 🎬 Video a recrear</div>
              <p className="sub" style={{ marginTop: 0, marginBottom: 6, color: 'var(--ink)', fontWeight: 600 }}>Acá va el baile o trend que querés copiar.</p>
              <p className="sub" style={hintS}>{mModo === 'reemplazar' ? 'De 3 a 30 segundos y hasta 10 MB (unos 10–15 s de video de celular).' : 'De 3 a 30 segundos y hasta 100 MB.'} Una sola persona, bien visible, de la cabeza a la cintura o cuerpo entero.</p>
              {mVideo ? (
                <div className="mvid">
                  <video src={mVideo.url} controls playsInline preload="metadata" />
                  <div className="mvid-info">
                    <span>Duración: <b>{Math.round(mVideo.dur) || '?'} s</b> · <b>{mVideo.mb.toFixed(1)} MB</b></span>
                    <button className="btn-grad" style={{ height: 40, padding: '0 14px', fontSize: 13 }} onClick={() => copiarLink(mVideo.url)}>{linkCopiado ? '¡Link copiado! ✓' : '📋 Copiar link del video'}</button>
                    <button className="btn-soft" onClick={() => setMVideo(null)}>Cambiar video</button>
                  </div>
                </div>
              ) : null}
              <div className="aplbl" style={{ marginTop: 14 }}>¿Cómo se ve la persona en el video?</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className={`opt ${mEncuadre === 'cara' ? 'on' : ''}`} onClick={() => setMEncuadre('cara')}>😊 Primer plano (cara)</button>
                <button className={`opt ${mEncuadre === 'medio' ? 'on' : ''}`} onClick={() => setMEncuadre('medio')}>👚 Medio cuerpo</button>
                <button className={`opt ${mEncuadre === 'entero' ? 'on' : ''}`} onClick={() => setMEncuadre('entero')}>💃 Cuerpo entero</button>
              </div>
              {mVideo ? (
                <input className="input" readOnly value={mVideo.url} onFocus={(e) => e.currentTarget.select()} aria-label="Link del video" style={{ width: '100%', boxSizing: 'border-box', marginTop: 10, fontSize: 11, height: 34 }} />
              ) : (
                <label className="upload-tile mup">
                  <input type="file" accept="video/mp4,video/quicktime,video/webm,video/*" onChange={onSubirVideoMotion} disabled={mSubiendo > 0} style={{ display: 'none' }} />
                  <span style={{ fontSize: 26, color: 'var(--rosa)' }}>＋</span>
                  <span className="sub" style={{ fontSize: 13, marginTop: 4 }}>{mSubiendo ? `Subiendo… ${mSubiendo}%` : 'Subir video'}</span>
                </label>
              )}
            </div>

            <div className="panel" style={{ marginBottom: 14 }}>
              <div className="h2" style={{ marginBottom: 4 }}>2. 👩 Imagen de tu avatar</div>
              <p className="sub" style={{ marginTop: 0, marginBottom: 6, color: 'var(--ink)', fontWeight: 600 }}>Acá va la foto de tu modelo: ella es la que va a aparecer en el video.</p>
              <p className="sub" style={hintS}>Elegí una con el mismo encuadre que el video (cuerpo entero si el video es de cuerpo entero).</p>
              {mEncuadre ? (
                <div className="mtip" style={{ marginBottom: 12 }}>
                  📐 Tu video es de <b>{mEncuadre === 'cara' ? 'primer plano de la cara' : mEncuadre === 'medio' ? 'medio cuerpo' : 'cuerpo entero'}</b>: elegí una foto de tu avatar <b>igual</b>. Si no tenés una así, activá esto y la app la prepara antes del video:
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, fontWeight: 700, cursor: 'pointer' }}>
                    <input type="checkbox" checked={mAdaptar} onChange={(e) => setMAdaptar(e.target.checked)} style={{ width: 18, height: 18 }} />
                    ✨ Adaptar mi foto a ese encuadre (cuesta 1 foto)
                  </label>
                </div>
              ) : (
                <div className="mtip" style={{ marginBottom: 12 }}>📐 Primero indicá arriba cómo se ve la persona en el video (cara, medio cuerpo o cuerpo entero) y te digo qué foto elegir.</div>
              )}
              <div className="mfotos">
                <label className="upload-tile mfoto-add">
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onSubirFotoMotion} style={{ display: 'none' }} />
                  <span style={{ fontSize: 20, color: 'var(--rosa)' }}>＋</span>
                  <span className="sub" style={{ fontSize: 11, marginTop: 2, textAlign: 'center' }}>{mSubiendoFoto ? 'Subiendo…' : 'Subir foto'}</span>
                </label>
                {(mFoto && !creaciones.some((c) => c.url === mFoto) ? [mFoto, ...creaciones.map((c) => c.url)] : creaciones.map((c) => c.url)).map((u) => (
                  <button key={u} className={`mfoto ${mFoto === u ? 'on' : ''}`} onClick={() => setMFoto(u)}>
                    <Image src={u} alt="" fill sizes="90px" />
                    {mFoto === u ? <span className="ck">✓</span> : null}
                  </button>
                ))}
              </div>
            </div>

            <div className="panel" style={{ marginBottom: 14 }}>
              <div className="h2" style={{ marginBottom: 4 }}>3. ✍️ Instrucciones <span className="sub" style={{ fontSize: 13, fontWeight: 600 }}>(opcional)</span></div>
              <p className="sub" style={{ marginTop: 0, marginBottom: 8 }}>¿Querés cambiarle algo a tu avatar? Por ejemplo la ropa o el pelo. Si escribís algo, primero se crea una foto nueva de tu avatar con ese cambio (cuesta como 1 foto y queda en tu galería) y después el video.</p>
              <textarea className="textarea" value={mTxt} onChange={(e) => setMTxt(e.target.value)} placeholder="Ej: con un vestido rojo corto · en bikini negro · con el pelo recogido" style={{ height: 80 }} />
            </div>

            <div className="panel" style={{ marginBottom: 14 }}>
              <div className="h2" style={{ marginBottom: 2 }}>4. Opciones</div>
              {mModo === 'mover' ? (
                <>
                  <div className="aplbl" style={{ marginTop: 12 }}>Encuadre</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className={`opt ${mOri === 'video' ? 'on' : ''}`} onClick={() => setMOri('video')}>Como en el video · hasta 30 s</button>
                    <button className={`opt ${mOri === 'image' ? 'on' : ''}`} onClick={() => setMOri('image')}>Como en la foto · hasta 10 s</button>
                  </div>
                  <p className="sub" style={{ fontSize: 12, margin: '6px 0 0' }}>Para bailes y trends: “Como en el video”. Para un gesto con el fondo de tu foto: “Como en la foto”.</p>
                  <div className="aplbl">Calidad</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className={`opt ${mCal === '720p' ? 'on' : ''}`} onClick={() => setMCal('720p')}>720p · más barato</button>
                    <button className={`opt ${mCal === '1080p' ? 'on' : ''}`} onClick={() => setMCal('1080p')}>1080p · más nítido</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="aplbl" style={{ marginTop: 12 }}>Calidad</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className={`opt ${mCal === '480p' ? 'on' : ''}`} onClick={() => setMCal('480p')}>480p · más barato</button>
                    <button className={`opt ${mCal === '720p' ? 'on' : ''}`} onClick={() => setMCal('720p')}>720p · más nítido</button>
                  </div>
                </>
              )}
            </div>

            {mPesado ? <p className="errbox" style={{ margin: '0 0 10px' }}>Para “Reemplazar en el video” el video tiene que pesar hasta 10 MB (este pesa {mVideo?.mb.toFixed(1)} MB). Recortalo o usá “Mover mi foto”.</p> : null}
            {mModo === 'mover' && mOri === 'image' && mVideo && mVideo.dur > 10 ? <p className="sub" style={{ fontSize: 12, margin: '0 0 10px' }}>⚠️ Con “Como en la foto” el video sale de 10 segundos como máximo.</p> : null}
            <button className={`btn-grad shine ${haciendoVideo === 'motion' ? 'busy' : ''}`} style={{ width: '100%' }} disabled={!mVideo || !mFoto || !mEncuadre || !!haciendoVideo || mSubiendo > 0 || mPesado} onClick={generarMotion}>
              {haciendoVideo === 'motion' ? 'Creando video…' : mModo === 'reemplazar' ? '🔁 Reemplazar con mi modelo' : '🕺 Generar video con movimiento'}
            </button>
            {!haciendoVideo && (!mVideo || !mFoto || !mEncuadre) ? <p className="sub" style={{ fontSize: 12, margin: '8px 0 0' }}>Falta: {[!mVideo ? 'subir el video a recrear' : '', !mEncuadre ? 'indicar cómo se ve la persona en el video' : '', !mFoto ? 'elegir la imagen de tu avatar' : ''].filter(Boolean).join(', ')}.</p> : null}
            {!haciendoVideo ? <p className="costo">{costoMotionTexto(costoDe(mModo === 'reemplazar' ? `wan/2-2-animate-replace|${mCal}` : `kling-3.0/motion-control|${mCal}`), mTxt.trim() || mAdaptar ? costoDe(claveFoto('seedream')) : null, !!mTxt.trim() || mAdaptar)}</p> : null}
            {vidMsg ? <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--violeta)' }}>{vidMsg}</p> : null}
            {mError || error ? <p className="errbox" style={{ marginTop: 10 }}>{mError || error}</p> : null}
            <p className="sub" style={{ fontSize: 12, marginTop: 12 }}>Se cobra por segundo de video (aprox. US$ 0,06–0,10 por segundo). Cuando esté listo aparece en Galería → Videos. ⏳ Los videos se borran solos a los 3 días: descargalos antes.</p>
          </>
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
            {espacio ? <MedidorEspacio uso={espacio} /> : null}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <button className={`opt ${galTab === 'fotos' ? 'on' : ''}`} onClick={() => setGalTab('fotos')}>🖼️ Fotos ({creaciones.length})</button>
              <button className={`opt ${galTab === 'videos' ? 'on' : ''}`} onClick={() => setGalTab('videos')}>🎬 Videos ({videos.length})</button>
            </div>
            {upMsg ? <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--violeta)' }}>{upMsg}</p> : null}
            {vidMsg ? <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--violeta)' }}>{vidMsg}</p> : null}
            {costoMsg ? <p className="costo ok" style={{ margin: '0 0 12px' }}>{costoMsg}</p> : null}
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
                <>
                <p className="sub" style={{ margin: '0 0 10px', fontSize: 12.5 }}>⏳ Los videos se borran solos a los 3 días. Descargá los que quieras guardar.</p>
                <div className="grid-cards stagger">
                  {videos.map((v) => (
                    <div key={v.id} className="tile" style={{ cursor: 'default' }}>
                      <video src={v.url} controls playsInline preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      <span className="vence">⏳ {venceEn(v.ts)}</span>
                      <button className="xbtn" title="Eliminar" onClick={() => borrarVideo(v)}>🗑️</button>
                    </div>
                  ))}
                </div>
                </>
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
        <button className={`tab ${vista === 'motion' ? 'on' : ''}`} onClick={() => setVista('motion')}><span className="ti"><Icon name="motion" /></span>Motion</button>
        <button className="tab" onClick={salir}><span className="ti"><Icon name="salir" /></span>Salir</button>
      </nav>

      {/* Barra de consola (desktop) */}
      <div className="consola">
        <span>CONSOLA · <span className="k">Kie API</span> · {modeloLabel}</span>
        <div className="rr"><span>{creaciones.length} creaciones</span><span>{videos.length} videos</span><span>● API en vivo</span></div>
      </div>

      {/* ===== MODALES ===== */}
      {abierto === 'personaje' ? (
        <Modal title={personaje.nombre ? `Modelo: ${personaje.nombre}` : 'Tu modelo'} onClose={() => setAbierto(null)}>
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
            <input className="input" value={personaje.nombre} onChange={(e) => { const v = e.target.value; setModelas((ms) => ms.map((m) => (m.id === personaje.id ? { ...m, nombre: v } : m))); }} onBlur={() => guardarPersonaje(personaje)} placeholder="Ej: Luna" style={{ display: 'block', marginTop: 6, width: 220, maxWidth: '100%' }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginTop: 14 }}>
            Contextura / medidas
            <input className="input" value={personaje.cuerpo ?? ''} onChange={(e) => { const v = e.target.value; setModelas((ms) => ms.map((m) => (m.id === personaje.id ? { ...m, cuerpo: v } : m))); }} onBlur={() => guardarPersonaje(personaje)} placeholder="Ej: 100-60-95, curvilínea, reloj de arena" style={{ display: 'block', marginTop: 6, width: '100%', boxSizing: 'border-box' }} />
            <span className="sub" style={{ display: 'block', fontSize: 12, fontWeight: 400, marginTop: 4 }}>Se respeta en todas las fotos y videos de esta modelo. La cara no se toca: las medidas van solo al cuerpo.</span>
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 18 }}>
            <button className="btn-soft" onClick={nuevaModelo}>＋ Agregar otra modelo</button>
            {modelas.length > 1 ? <button className="btn-soft" onClick={borrarModelo}>🗑️ Eliminar esta modelo</button> : null}
          </div>
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
              {typeof lightbox.credits === 'number' ? <span>Costo: <b>{fmtCred(lightbox.credits)} créditos</b> (≈ {fmtUsd(lightbox.credits)})</span> : null}
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
            <button className="btn-grad shine" disabled={busy} style={{ width: '100%', marginTop: 10 }} onClick={() => { const c = lightbox; if (c) sesionDeFotos(c); }}>
              {busy ? 'Generando…' : `📸 Sesión de fotos · ${TOMAS_SESION.length} tomas`}
            </button>
            {lightbox.prompt && lightbox.refs && lightbox.refs.length ? (
              <button className="btn-ghost" disabled={busy} style={{ width: '100%', marginTop: 10 }} onClick={() => { const c = lightbox; if (c) variar(c); }}>
                {busy ? 'Generando…' : '🔁 Repetir / Variar (crear parecidas)'}
              </button>
            ) : null}
            <div style={{ marginTop: 12 }}>
              <input className="input" value={motion} onChange={(e) => setMotion(e.target.value)} placeholder="Movimiento (opcional): ej. camina y sonríe" style={{ width: '100%', boxSizing: 'border-box' }} />
              <button className="btn-grad" disabled={!!haciendoVideo} style={{ width: '100%', marginTop: 8 }} onClick={() => { const c = lightbox; setLightbox(null); if (c) crearVideo(c); }}>
                {haciendoVideo ? 'Creando video…' : '🎬 Crear video'}
              </button>
              <p className="sub" style={{ margin: '8px 0 0', fontSize: 12 }}>El video (Veo 3.1) tarda 1–4 min y gasta más crédito que una foto.</p>
              <button className="btn-ghost" style={{ width: '100%', marginTop: 10 }} onClick={() => { const c = lightbox; setLightbox(null); if (c) { setMFoto(c.url); setVista('motion'); } }}>
                🕺 Usar esta foto en Motion (copiar un baile o trend)
              </button>
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

/* ---------- Espacio de almacenamiento ---------- */
// Plan gratis (Hobby) de Vercel Blob: 1 GB. Si pasás a Pro son 5 GB: cambiar acá.
const LIMITE_ESPACIO = 1024 * 1024 * 1024;
function fmtBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toLocaleString('es-AR', { maximumFractionDigits: 2 })} GB`;
  return `${Math.round(n / 1024 ** 2).toLocaleString('es-AR')} MB`;
}
function MedidorEspacio({ uso }: { uso: { total: number; carpetas: Record<string, number> } }) {
  const pct = Math.min(100, (uso.total / LIMITE_ESPACIO) * 100);
  const c = uso.carpetas;
  const grupos: [string, number][] = [
    ['Fotos', c.results ?? 0],
    ['Videos', c.videos ?? 0],
    ['Videos de referencia', c.motion ?? 0],
    ['Audios', c.voces ?? 0],
  ];
  const otros = uso.total - grupos.reduce((a, [, v]) => a + v, 0);
  grupos.push(['Referencias y otros', Math.max(0, otros)]);
  const nivel = pct >= 90 ? 'alto' : pct >= 70 ? 'medio' : 'ok';
  return (
    <div className={`espacio ${nivel}`}>
      <div className="esp-top">
        <span>💾 Espacio usado: <b>{fmtBytes(uso.total)}</b> de {fmtBytes(LIMITE_ESPACIO)}</span>
        <b>{Math.round(pct)}%</b>
      </div>
      <div className="esp-barra"><span style={{ width: `${pct}%` }} /></div>
      <div className="esp-det">{grupos.filter(([, v]) => v > 0).map(([k, v]) => `${k}: ${fmtBytes(v)}`).join(' · ')}</div>
      {nivel !== 'ok' ? <div className="esp-aviso">{nivel === 'alto' ? '⚠️ Casi lleno: si pasás el límite, Vercel bloquea el almacenamiento. Borrá lo que no uses o pasá a Pro.' : '👀 Pasaste el 70%: borrá fotos o videos que no uses para liberar espacio.'}</div> : null}
    </div>
  );
}

/* ---------- Créditos de Kie ---------- */
// 1 crédito de Kie ≈ US$ 0,005 (1.000 créditos ≈ US$ 5). Es aproximado.
const USD_POR_CREDITO = 0.005;
function fmtCred(n: number): string {
  return n.toLocaleString('es-AR', { maximumFractionDigits: 1 });
}
function fmtUsd(n: number): string {
  return `US$ ${(n * USD_POR_CREDITO).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function costoTexto(porUnidad: number | null, n: number, unidad: string): string {
  if (porUnidad === null) return `💳 Costo: lo vas a ver después de la primera ${unidad} con este modelo.`;
  const total = porUnidad * n;
  return n > 1
    ? `💳 ≈ ${fmtCred(porUnidad)} créditos por ${unidad} × ${n} = ${fmtCred(total)} créditos (≈ ${fmtUsd(total)})`
    : `💳 ≈ ${fmtCred(total)} créditos (≈ ${fmtUsd(total)})`;
}
function costoMotionTexto(ultimoVideo: number | null, foto: number | null, conCambios: boolean): string {
  const partes: string[] = [];
  partes.push(ultimoVideo !== null
    ? `💳 El último video así costó ${fmtCred(ultimoVideo)} créditos (≈ ${fmtUsd(ultimoVideo)}). Depende de cuánto dure.`
    : '💳 El costo del video lo vas a ver cuando termine el primero así (depende de cuánto dure).');
  if (conCambios) partes.push(foto !== null ? `+ ≈ ${fmtCred(foto)} créditos por la foto con los cambios.` : '+ el costo de 1 foto por los cambios.');
  return partes.join(' ');
}

/** Los videos se borran a los 3 días (ver src/lib/limpieza.ts). */
function venceEn(ts: number): string {
  const dias = Math.ceil((ts + 3 * 24 * 60 * 60 * 1000 - Date.now()) / (24 * 60 * 60 * 1000));
  if (dias <= 1) return 'se borra en menos de 24 h';
  return `se borra en ${dias} días`;
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
    motion: <><circle cx="14" cy="4.5" r="2" /><path d="M14 6.5l-1.5 6 3 3.5v5" /><path d="M12.5 12.5l-3 2.5-1.5 5" /><path d="M9 9l4-1.5 3 3 3-1" /><path d="M3.5 8.5c1.2-1.4 1.2-3.6 0-5M6 10.5c1.8-2.2 1.8-5.8 0-8" /></>,
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
