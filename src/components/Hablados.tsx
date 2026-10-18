'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';

import { aspectoMasCercano, cuadroDeArchivo, esperarTarea, subirAMotion, subirImagen } from '@/lib/cliente/video';
import { AVISO_FALLO_ROPA, vestuarioATexto } from '@/lib/cliente/vestuario';
import { componerNodoFoto, medidasDe, type RolImagen } from '@/lib/estudio/prompt';
import {
  ESCENARIO_UGC, ESCENARIOS, ESTILOS, GRABACIONES, IDIOMA_DEFECTO, VOCES_OMNI, componerFotoUGC, durValida, palabrasMax, pistaFotoInicial,
  type FondoUGC, type Guion, type Motor, type UsoProducto,
} from '@/lib/estudio/hablados';
import ConfirmarVideo, { type Estimado } from '@/components/ConfirmarVideo';
import ModoRopa from '@/components/ModoRopa';

type Modelo = { id: string; nombre: string; refs: string[]; cuerpo?: string; entero?: string; medio?: string; promptFijo?: string };
type Props = {
  modelas: Modelo[];
  activoId: string;
  vestidos: { url: string }[];
  costo: (clave: string) => number | null;
  estimar: (clave: string, dur: number) => Estimado;
  saldo: number | null;
  claveFoto: (modelo: string) => string;
  onCreacion: (c: { url: string; prompt: string; modelo: string; refs: string[]; aspect: string; credits?: number }) => void;
  onVideo: (url: string) => void;
  onTrabajo: (msg: string) => void;
  onPublicar: (url: string, tipo: 'foto' | 'video') => void;
  onGuardar: (url: string, tipo: 'foto' | 'video') => void;
  onSaldo: () => void;
  /** Precio de la cuenta: créditos de Kie × esto (1 para el administrador). */
  mult?: number;
};

/** Todo lo que hay que recordar (se guarda en el celu por si se cierra la app). */
type Estado = {
  /** 'ugc': UGC de producto (lugar del primer cuadro de un video + foto del producto). */
  modo: 'hablado' | 'ugc';
  /** UGC: primer cuadro del video de referencia (solo se sube la imagen, no el video). */
  ref: { url: string; asp: string } | null;
  /** UGC: foto del producto (va tal cual a la IA: es la que manda). */
  prodUrl: string;
  prodUso: UsoProducto;
  /** UGC: conservar el lugar exacto del cuadro o crear uno parecido. */
  fondoUgc: FondoUGC;
  escenario: string;
  escenarioTexto: string;
  grabacion: string;
  ropa: 'foto' | 'texto';
  ropaUrl: string;
  ropaTexto: string;
  /** Cómo describió la IA la ropa de la foto (eso es lo que se usa, no la foto). */
  ropaDesc?: string;
  /** Aviso si no se pudo describir la ropa y se usó la foto. */
  ropaAviso?: string;
  instr: string;
  fotoModelo: string;
  fotos: string[];
  elegida: string;
  fotoTask: string;
  fotoCred?: number;
  idioma: string;
  tema: string;
  extra: string;
  dur: number;
  guiones: Guion[];
  guionSel: number;
  texto: string;
  gestos: string;
  caption: string;
  /** Traducción al español de lo que dice, y el texto al que corresponde. */
  traduccion: string;
  traduccionDe: string;
  motor: Motor;
  calidad: '720p' | '1080p';
  vozOmni: string;
  videoTask: string;
  resultado: string;
  videoCred?: number;
  /** Lo que cobró Kie por escribir los guiones. */
  guionCred?: number;
};
const VACIO: Estado = {
  modo: 'hablado', ref: null, prodUrl: '', prodUso: 'puesto', fondoUgc: 'exacto',
  escenario: 'sillon', escenarioTexto: '', grabacion: 'apoyado', ropa: 'foto', ropaUrl: '', ropaTexto: '', instr: '', fotoModelo: 'nanopro',
  fotos: [], elegida: '', fotoTask: '', idioma: '', tema: '', extra: '', dur: 10, guiones: [], guionSel: -1, texto: '', gestos: '', caption: '', traduccion: '', traduccionDe: '',
  motor: 'omni', calidad: '720p', vozOmni: VOCES_OMNI[0].id, videoTask: '', resultado: '',
};
const CLAVE = 'musa-hablados-v1';
/** Duraciones que se pueden elegir con cada motor (Omni hace hasta 10 s). */
const DURS: Record<Motor, number[]> = { omni: [4, 6, 8, 10], kling3: [6, 8, 10, 12, 15] };
/** Una sola vez: el usuario eligió Omni como motor principal (antes quedaba Kling guardado). */
const CLAVE_OMNI = 'musa-hablados-omni-v1';
const fmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString('es-AR');
const usd = (n: number) => `≈ US$ ${(n * 0.005).toFixed(2).replace('.', ',')}`;
const contar = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;
/**
 * Precios publicados por Kie (kie.ai, revisados el 15/10/2026), para estimar
 * antes del primer video. Después se usa lo que cobró de verdad.
 *  - Gemini Omni sin video de entrada, 720p o 1080p: 4 s 63, 6 s 84, 8 s 105, 10 s 126 créditos.
 *  - Kling 3.0 con sonido: Standard (720p) 20 créditos por segundo, Pro (1080p) 27.
 */
const OMNI: Record<number, number> = { 4: 63, 6: 84, 8: 105, 10: 126 };
const listaKie = (motor: Motor, calidad: string, dur: number): number | null =>
  motor === 'omni' ? (OMNI[dur] ?? null) : dur * (calidad === '1080p' ? 27 : 20);

export default function Hablados(props: Props) {
  const { modelas, activoId, vestidos, costo, estimar, saldo, claveFoto, onCreacion, onVideo, onTrabajo, onPublicar, onGuardar, onSaldo, mult = 1 } = props;
  const [e, setE] = useState<Estado>(VACIO);
  const eRef = useRef(e); eRef.current = e;
  const set = (p: Partial<Estado>) => setE((x) => ({ ...x, ...p }));
  const [error, setError] = useState('');
  const [creandoFoto, setCreandoFoto] = useState(false);
  const [creandoVideo, setCreandoVideo] = useState(false);
  const [escribiendo, setEscribiendo] = useState(false);
  const [traduciendo, setTraduciendo] = useState(false);
  const [errorGuion, setErrorGuion] = useState('');
  const pasoGuion = useRef<HTMLDivElement | null>(null);
  const [subiendoRopa, setSubiendoRopa] = useState(false);
  const [subiendoRef, setSubiendoRef] = useState(false);
  const [subiendoVoz, setSubiendoVoz] = useState(0);
  const [procesandoVoz, setProcesandoVoz] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [voces, setVoces] = useState<Record<string, { url: string; dur: number }>>({});
  const [idiomaDef, setIdiomaDef] = useState('');
  const [copiado, setCopiado] = useState(false);
  const vivo = useRef(true);

  const modelo = modelas.find((m) => m.id === activoId) ?? modelas[0];
  const nombre = modelo?.nombre || 'tu modelo';
  const voz = modelo ? voces[modelo.id] : undefined;
  const ugc = e.modo === 'ugc';
  const escenarioEn = ugc ? ESCENARIO_UGC : e.escenario === 'otro' ? e.escenarioTexto.trim() : (ESCENARIOS.find((x) => x.id === e.escenario)?.en ?? ESCENARIOS[0].en);
  const idioma = e.idioma.trim() || idiomaDef || IDIOMA_DEFECTO;

  /* ----- recordar el progreso en el celu + datos guardados ----- */
  const [listo, setListo] = useState(false);
  useEffect(() => {
    vivo.current = true;
    try {
      const s = localStorage.getItem(CLAVE);
      if (s) {
        const x = { ...VACIO, ...(JSON.parse(s) as Estado) };
        if (!localStorage.getItem(CLAVE_OMNI)) { x.motor = 'omni'; x.dur = durValida('omni', x.dur); }
        setE(x);
      }
      localStorage.setItem(CLAVE_OMNI, '1');
    } catch { /* */ }
    setListo(true);
    fetch('/api/hablados').then((r) => r.json()).then((d) => {
      if (d && typeof d.idioma === 'string') setIdiomaDef(d.idioma);
      if (d && d.voces && typeof d.voces === 'object') setVoces(d.voces);
    }).catch(() => undefined);
    return () => { vivo.current = false; };
  }, []);
  useEffect(() => { if (!listo) return; try { localStorage.setItem(CLAVE, JSON.stringify(e)); } catch { /* */ } }, [e, listo]);
  // Si quedó algo creándose (se cerró la app), lo seguimos esperando.
  useEffect(() => {
    if (!listo) return;
    const x = eRef.current;
    if (x.fotoTask) terminarFoto(x.fotoTask, '', []);
    if (x.videoTask) terminarVideo(x.videoTask);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listo]);
  useEffect(() => {
    onTrabajo(creandoFoto ? '🎙️ Hablados: creando la foto inicial…' : creandoVideo ? '🎙️ Hablados: creando el video…' : escribiendo ? '🎙️ Hablados: escribiendo los guiones…' : '');
  }, [creandoFoto, creandoVideo, escribiendo, onTrabajo]);

  function empezarOtro() {
    if ((creandoFoto || creandoVideo) && !window.confirm('Hay algo creándose. ¿Empezar otro igual? (lo que termine va a aparecer en tu galería)')) return;
    // Se mantiene lo que suele repetirse: escenario, cámara, idioma, motor.
    setE((x) => ({ ...VACIO, modo: x.modo, prodUso: x.prodUso, fondoUgc: x.fondoUgc, escenario: x.escenario, escenarioTexto: x.escenarioTexto, grabacion: x.grabacion, idioma: x.idioma, motor: x.motor, calidad: x.calidad, vozOmni: x.vozOmni, dur: x.dur, fotoModelo: x.fotoModelo }));
    setError('');
  }
  function cambiarModo(modo: Estado['modo']) {
    if (modo === e.modo) return;
    // Al cambiar de modo la foto aprobada ya no sirve (es de otro lugar o sin el producto).
    set({ modo, grabacion: modo === 'ugc' ? 'ref' : (e.grabacion === 'ref' ? 'apoyado' : e.grabacion), fotos: [], elegida: '', guiones: [], guionSel: -1 });
    setError('');
  }

  /* ----- UGC: video de referencia (solo su primer cuadro) y producto ----- */
  async function elegirReferencia(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0]; ev.target.value = '';
    if (!f) return;
    setError(''); setSubiendoRef(true);
    try {
      let img: File;
      let asp: string;
      if (f.type.startsWith('video/')) {
        // El cuadro sale del archivo en el celu: el video no se sube.
        const c = await cuadroDeArchivo(f);
        if (!c) throw new Error('No se pudo sacar el primer cuadro de ese video. Probá con una captura de pantalla.');
        img = new File([c.blob], 'referencia.jpg', { type: 'image/jpeg' });
        asp = aspectoMasCercano(c.w, c.h);
      } else {
        img = f;
        asp = await new Promise<string>((ok) => {
          const u = URL.createObjectURL(f); const i = new window.Image();
          i.onload = () => { ok(aspectoMasCercano(i.naturalWidth, i.naturalHeight)); URL.revokeObjectURL(u); };
          i.onerror = () => { ok('9:16'); URL.revokeObjectURL(u); };
          i.src = u;
        });
      }
      set({ ref: { url: await subirImagen(img), asp }, fotos: [], elegida: '' });
    } catch (er) {
      setError(er instanceof Error && er.message ? er.message : 'No se pudo usar ese video.');
    } finally { setSubiendoRef(false); }
  }
  async function subirProducto(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0]; ev.target.value = '';
    if (!f) return;
    setSubiendoRopa(true); setError('');
    try { set({ prodUrl: await subirImagen(f) }); } catch { setError('No se pudo subir la foto del producto.'); } finally { setSubiendoRopa(false); }
  }

  /* ----- 1. Voz ----- */
  async function subirVoz(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0]; ev.target.value = '';
    if (!f || !modelo) return;
    if (f.size > 100 * 1024 * 1024) { setError('El archivo pesa más de 100 MB. Mandá uno más corto.'); return; }
    setError(''); setSubiendoVoz(1);
    try {
      const url = await subirAMotion(f, `voz-${modelo.id}-${Date.now()}`, setSubiendoVoz);
      setSubiendoVoz(0); setProcesandoVoz(true);
      const r = await fetch('/api/hablados/voz', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, modeloId: modelo.id }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.url) throw new Error(d.error ?? 'No se pudo guardar la voz.');
      setVoces((v) => ({ ...v, [modelo.id]: { url: d.url, dur: Number(d.dur) || 0 } }));
    } catch (er) {
      setError(er instanceof Error && er.message ? er.message : 'No se pudo subir la voz.');
    } finally { setSubiendoVoz(0); setProcesandoVoz(false); }
  }
  async function borrarVoz() {
    if (!modelo || !window.confirm(`¿Borrar la muestra de voz de ${nombre}?`)) return;
    await fetch(`/api/hablados/voz?modeloId=${encodeURIComponent(modelo.id)}`, { method: 'DELETE' }).catch(() => undefined);
    setVoces((v) => { const n = { ...v }; delete n[modelo.id]; return n; });
  }

  /* ----- 3. Vestuario + foto inicial ----- */
  async function subirRopa(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0]; ev.target.value = '';
    if (!f) return;
    setSubiendoRopa(true); setError('');
    try { set({ ropa: 'foto', ropaUrl: await subirImagen(f), ropaDesc: '' }); } catch { setError('No se pudo subir la foto de la ropa.'); } finally { setSubiendoRopa(false); }
  }
  async function crearFoto() {
    if (!modelo || creandoFoto) return;
    if (!modelo.refs.length) { setError(`${nombre} no tiene fotos de cara. Cargalas en su ficha.`); return; }
    if (ugc) { await crearFotoUGC(); return; }
    if (e.escenario === 'otro' && !e.escenarioTexto.trim()) { setError('Escribí el escenario (o elegí uno de la lista).'); return; }
    if (e.ropa === 'foto' && !e.ropaUrl) { setError('Subí o elegí la foto del vestuario a seguir (o escribila).'); return; }
    if (e.ropa === 'texto' && !e.ropaTexto.trim()) { setError('Escribí qué ropa querés.'); return; }
    setError(''); setCreandoFoto(true);
    const cuerpo = modelo.entero || modelo.medio;
    const items: { url: string; rol: RolImagen }[] = [
      ...modelo.refs.slice(0, 3).map((url) => ({ url, rol: 'cara' as const })),
      ...(cuerpo ? [{ url: cuerpo, rol: 'cuerpo' as const }] : []),
      ...(e.ropa === 'foto' && e.ropaUrl ? [{ url: e.ropaUrl, rol: 'vestuario' as const }] : []),
    ];
    const ropa = e.ropa === 'texto' ? `She wears ${e.ropaTexto.trim()}.` : '';
    try {
      // La foto de la ropa no va a la IA de imagen: va su descripción (así no copia el cuerpo de quien la tiene puesta).
      const v = await vestuarioATexto(items);
      set({ ropaDesc: v.descripciones[0] ?? '', ropaAviso: v.fallo ? AVISO_FALLO_ROPA : '' });
      const prompt = componerNodoFoto(v.items.map((x) => x.rol), [pistaFotoInicial(escenarioEn, e.grabacion), ...v.textos, ropa, e.instr], modelo.cuerpo, modelo.promptFijo);
      const imageUrls = v.items.map((x) => x.url);
      const res = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, imageUrls, aspect: '9:16', modelo: e.fotoModelo }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.taskId) throw new Error(d.error ?? 'No se pudo crear la foto.');
      set({ fotoTask: d.taskId });
      await terminarFoto(d.taskId, prompt, imageUrls);
    } catch (er) {
      if (vivo.current) { setError(er instanceof Error ? er.message : 'No se pudo crear la foto.'); set({ fotoTask: '' }); setCreandoFoto(false); }
    }
  }
  /** UGC: cuadro de referencia + caras + cuerpo + producto (la foto del producto va tal cual). */
  async function crearFotoUGC() {
    if (!modelo) return;
    if (!e.ref) { setError('Elegí el video de referencia (o una captura) en el paso 2.'); return; }
    if (!e.prodUrl) { setError('Subí la foto del producto.'); return; }
    setError(''); setCreandoFoto(true);
    const caras = modelo.refs.slice(0, 3);
    const cuerpo = modelo.entero || modelo.medio;
    const imageUrls = [e.ref.url, ...caras, ...(cuerpo ? [cuerpo] : []), e.prodUrl];
    const prompt = componerFotoUGC({ caras: caras.length, conCuerpo: !!cuerpo, uso: e.prodUso, fondo: e.fondoUgc, instr: e.instr, cuerpo: modelo.cuerpo, fijo: modelo.promptFijo });
    try {
      const res = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, imageUrls, aspect: '9:16', modelo: e.fotoModelo }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.taskId) throw new Error(d.error ?? 'No se pudo crear la foto.');
      set({ fotoTask: d.taskId });
      await terminarFoto(d.taskId, prompt, imageUrls);
    } catch (er) {
      if (vivo.current) { setError(er instanceof Error ? er.message : 'No se pudo crear la foto.'); set({ fotoTask: '' }); setCreandoFoto(false); }
    }
  }
  async function terminarFoto(taskId: string, prompt: string, imageUrls: string[]) {
    setCreandoFoto(true);
    try {
      const r = await esperarTarea(taskId, () => vivo.current);
      setE((x) => ({ ...x, fotoTask: '', fotos: [r.url, ...x.fotos].slice(0, 6), fotoCred: r.credits }));
      onCreacion({ url: r.url, prompt: prompt || 'Hablados: foto inicial', modelo: eRef.current.fotoModelo, refs: imageUrls, aspect: '9:16', credits: r.credits });
      onSaldo();
    } catch (er) {
      if (vivo.current && !(er instanceof Error && er.message === 'cancelado')) { setError(er instanceof Error ? er.message : 'Error.'); set({ fotoTask: '' }); }
    } finally { if (vivo.current) setCreandoFoto(false); }
  }

  /* ----- 4. Idioma ----- */
  async function guardarIdioma() {
    const v = e.idioma.trim();
    if (!v) return;
    const r = await fetch('/api/hablados', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idioma: v }) }).catch(() => null);
    if (r?.ok) setIdiomaDef(v); else setError('No se pudo guardar el idioma.');
  }

  /* ----- 5. Guiones ----- */
  async function escribirGuiones() {
    if (!e.tema.trim() || escribiendo) { if (!e.tema.trim()) setErrorGuion(ugc ? 'Escribí qué producto es y qué tiene de bueno.' : 'Escribí de qué querés que hable.'); return; }
    setErrorGuion(''); setEscribiendo(true);
    try {
      const r = await fetch('/api/guiones', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tema: e.tema, extra: e.extra, idioma, dur: e.dur, nombre: modelo?.nombre, escenario: escenarioEn, ugc }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !Array.isArray(d.guiones)) throw new Error(d.error ?? 'No se pudieron escribir los guiones.');
      if (!d.guiones.length) throw new Error('La IA no devolvió guiones. Probá de nuevo.');
      set({ guiones: d.guiones, guionSel: -1, guionCred: typeof d.credits === 'number' ? d.credits : undefined });
      onSaldo();
    } catch (er) { setErrorGuion(er instanceof Error ? er.message : 'No se pudieron escribir los guiones.'); } finally { setEscribiendo(false); }
  }
  function elegirGuion(i: number) {
    const g = e.guiones[i];
    if (!g) return;
    setErrorGuion('');
    set({ guionSel: i, texto: g.texto, gestos: g.gestos ?? '', caption: g.caption ?? '', traduccion: g.traduccion ?? '', traduccionDe: g.traduccion ? g.texto : '' });
  }
  async function traducir() {
    const texto = e.texto.trim();
    if (!texto || traduciendo) return;
    setErrorGuion(''); setTraduciendo(true);
    try {
      const r = await fetch('/api/traducir', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || typeof d.traduccion !== 'string') throw new Error(d.error ?? 'No se pudo traducir.');
      set({ traduccion: d.traduccion, traduccionDe: texto });
    } catch (er) { setErrorGuion(er instanceof Error ? er.message : 'No se pudo traducir.'); } finally { setTraduciendo(false); }
  }
  async function copiarCaption() {
    try { await navigator.clipboard.writeText(e.caption); setCopiado(true); setTimeout(() => setCopiado(false), 2000); } catch { /* */ }
  }

  /* ----- 6. Video ----- */
  const durVideo = durValida(e.motor, e.dur);
  const claveVideo = e.motor === 'omni' ? `gemini-omni-video|${e.calidad}` : `kling-3.0/video|${e.calidad === '1080p' ? 'pro' : 'std'}`;
  const listaK = listaKie(e.motor, e.calidad, durVideo);
  const lista = listaK === null ? null : listaK * mult;
  const estimado: Estimado = estimar(claveVideo, durVideo) ?? (lista !== null ? { creditos: lista, porSegundo: true } : null);
  async function crearVideo() {
    if (!modelo || !e.elegida || !e.texto.trim() || creandoVideo) return;
    setError(''); setCreandoVideo(true);
    try {
      const res = await fetch('/api/hablado', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          motor: e.motor, modeloId: modelo.id, foto: e.elegida, caras: [...modelo.refs.slice(0, 3), ...(modelo.entero || modelo.medio ? [(modelo.entero || modelo.medio) as string] : [])], texto: e.texto, idioma, escenario: escenarioEn,
          grabacion: e.grabacion, gestos: e.gestos, fijo: modelo.promptFijo, cuerpo: modelo.cuerpo, dur: durVideo, calidad: e.calidad, vozOmni: e.vozOmni,
          ...(ugc ? { producto: e.prodUso } : {}),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.taskId) throw new Error(d.error ?? 'No se pudo crear el video.');
      set({ videoTask: d.taskId });
      await terminarVideo(d.taskId);
    } catch (er) {
      if (vivo.current) { setError(er instanceof Error ? er.message : 'No se pudo crear el video.'); set({ videoTask: '' }); setCreandoVideo(false); }
    }
  }
  async function terminarVideo(taskId: string) {
    setCreandoVideo(true);
    try {
      const r = await esperarTarea(taskId, () => vivo.current);
      if (r.aviso) setError(r.aviso);
      set({ videoTask: '', resultado: r.url, videoCred: r.credits });
      onVideo(r.url); onSaldo();
    } catch (er) {
      if (vivo.current && !(er instanceof Error && er.message === 'cancelado')) { setError(er instanceof Error ? er.message : 'Error.'); set({ videoTask: '' }); }
    } finally { if (vivo.current) setCreandoVideo(false); }
  }

  const costoFoto = costo(claveFoto(e.fotoModelo));
  const palabras = contar(e.texto);
  const max = palabrasMax(durVideo);
  const n = (k: number) => <span className="vr-n">{k}</span>;

  /* ===================== Render ===================== */
  return (
    <div className="vr">
      <p className="sub" style={{ marginTop: 0 }}>Videos de <b>{nombre}</b> hablando a cámara, casual y con gestos reales: el video se genera entero (no es una foto animada). Vos aprobás la foto y el guion antes de gastar en el video.</p>
      <div className="lz-chips">
        <button className={`opt ${!ugc ? 'on' : ''}`} onClick={() => cambiarModo('hablado')}>🎙️ Hablado</button>
        <button className={`opt ${ugc ? 'on' : ''}`} onClick={() => cambiarModo('ugc')}>🛍️ UGC de producto</button>
      </div>
      {ugc ? <p className="vr-nota" style={{ marginTop: 0 }}>Tomás un video que te guste (ej. un TikTok) <b>solo como molde</b>: de su primer cuadro sale el lugar, la luz y el encuadre. {nombre} aparece con <b>tu producto</b> y dice <b>tu propio guion</b>; no se copia lo que dice el video.</p> : null}

      {/* 1. Modelo */}
      <div className="panel vr-paso hb-paso">
        <div className="vr-tit">{n(1)} 👩 Modelo</div>
        <div className="hb-ref">
          <span className="vr-th">{modelo?.refs[0] ? <Image src={modelo.refs[0]} alt="" fill sizes="64px" /> : null}</span>
          <p className="vr-nota" style={{ margin: 0 }}>Referencia principal: las fotos de cara de la ficha de <b>{nombre}</b> ({modelo?.refs.length ?? 0}). Para cambiar de modelo, elegila arriba en Personaje.</p>
        </div>
        <div className="vr-tit chico" style={{ marginTop: 12 }}>🎙️ Su voz <span className="vr-nota" style={{ margin: 0, fontWeight: 600 }}>(para Kling 3.0)</span></div>
        {voz ? (
          <>
            <div className="hb-voz">
              <audio src={voz.url} controls preload="none" />
              <button className="btn-ghost" onClick={borrarVoz} style={{ padding: '6px 10px', fontSize: 12 }}>🗑️</button>
            </div>
            <p className="vr-nota">✓ Muestra de {fmt(voz.dur)} s guardada. Se le manda a Kling 3.0 como voz de {nombre}. Todavía no lo comprobamos con un video real: fijate en el primero si suena igual.</p>
          </>
        ) : (
          <p className="vr-nota" style={{ marginTop: 0 }}>Subí un video o audio donde {nombre} hable (de 5 a 30 s, solo su voz, sin música). Se limpia y queda guardado. Sin muestra, el motor elige la voz solo.</p>
        )}
        <label className="btn-soft vr-lbl" style={{ marginTop: 8 }}>
          <input type="file" accept="video/*,audio/*" onChange={subirVoz} style={{ display: 'none' }} disabled={subiendoVoz > 0 || procesandoVoz} />
          {procesandoVoz ? '🎧 Limpiando la voz…' : subiendoVoz ? `Subiendo… ${subiendoVoz}%` : voz ? '🔄 Cambiar muestra de voz' : '🎙️ Subir muestra de voz'}
        </label>
      </div>

      {/* 2. Escenario y cámara */}
      <div className="panel vr-paso hb-paso">
        {ugc ? (
          <>
            <div className="vr-tit">{n(2)} 🎞️ Video de referencia</div>
            <div className="hb-ref">
              <span className="vr-th" style={{ width: 72, height: 128 }}>{e.ref ? <Image src={e.ref.url} alt="" fill sizes="72px" /> : null}</span>
              <p className="vr-nota" style={{ margin: 0 }}>
                {e.ref
                  ? <>✓ Primer cuadro listo. De acá se toma el lugar, la luz y el encuadre; la persona del video <b>no</b> se copia.{e.ref.asp !== '9:16' ? ' Ojo: no es vertical, la foto va a salir vertical (9:16) igual.' : ''}</>
                  : <>Elegí el video (de tu celu) y la app saca su <b>primer cuadro</b>. El video no se sube ni se gasta nada. Si preferís otro momento, subí una captura de pantalla.</>}
              </p>
            </div>
            <div className="vr-fila">
              <label className="btn-soft vr-lbl" style={{ flex: 1 }}>
                <input type="file" accept="video/*" onChange={elegirReferencia} style={{ display: 'none' }} disabled={subiendoRef} />
                {subiendoRef ? 'Sacando el cuadro…' : e.ref ? '🔄 Otro video' : '🎞️ Elegir video'}
              </label>
              <label className="btn-ghost vr-lbl" style={{ flex: 1 }}>
                <input type="file" accept="image/*" onChange={elegirReferencia} style={{ display: 'none' }} disabled={subiendoRef} />
                📷 Subir captura
              </label>
            </div>
            <div className="vr-tit chico">🏙️ El lugar</div>
            <div className="lz-chips">
              <button className={`opt ${e.fondoUgc === 'exacto' ? 'on' : ''}`} onClick={() => set({ fondoUgc: 'exacto' })}>📍 Mismo lugar exacto</button>
              <button className={`opt ${e.fondoUgc === 'parecido' ? 'on' : ''}`} onClick={() => set({ fondoUgc: 'parecido' })}>🔄 Lugar parecido</button>
            </div>
            <p className="vr-nota" style={{ marginTop: 0 }}>{e.fondoUgc === 'exacto'
              ? 'Se queda el fondo del video (calle, autos, encuadre; también la mano y el micrófono si hay entrevistador) y solo cambia la persona. Puede no salir idéntico al píxel.'
              : 'Mismo tipo de lugar y encuadre, pero otro sitio: sirve para que no se note de qué video salió.'}</p>
          </>
        ) : (
          <>
            <div className="vr-tit">{n(2)} 📍 Escenario y forma de grabar</div>
            <div className="lz-chips">
              {ESCENARIOS.map((x) => <button key={x.id} className={`opt ${e.escenario === x.id ? 'on' : ''}`} onClick={() => set({ escenario: x.id })}>{x.label}</button>)}
              <button className={`opt ${e.escenario === 'otro' ? 'on' : ''}`} onClick={() => set({ escenario: 'otro' })}>✏️ Otro</button>
            </div>
            {e.escenario === 'otro' ? (
              <input className="input" value={e.escenarioTexto} onChange={(ev) => set({ escenarioTexto: ev.target.value })} placeholder="Ej: sentada en un banco de una plaza, de tarde" style={{ width: '100%', boxSizing: 'border-box', marginBottom: 8 }} />
            ) : null}
          </>
        )}
        <div className="vr-tit chico">🎥 ¿Quién graba?</div>
        <div className="lz-chips">
          {GRABACIONES.filter((x) => ugc || !x.soloUgc).map((x) => <button key={x.id} className={`opt ${e.grabacion === x.id ? 'on' : ''}`} onClick={() => set({ grabacion: x.id })}>{x.label}</button>)}
        </div>
      </div>

      {/* 3. Vestuario → foto inicial */}
      <div className="panel vr-paso hb-paso">
        <div className="vr-tit">{n(3)} {ugc ? '🛍️ Producto' : '👗 Vestuario'}</div>
        <div className="hb-par">
          <div>
            <span className="hb-caja">
              {ugc
                ? (e.prodUrl ? <Image src={e.prodUrl} alt="" fill sizes="40vw" /> : <span className="hb-caja-vacia" style={{ height: '100%' }}>Foto del producto</span>)
                : e.ropa === 'foto' && e.ropaUrl ? <Image src={e.ropaUrl} alt="" fill sizes="40vw" /> : <span className="hb-caja-vacia" style={{ height: '100%' }}>{e.ropa === 'texto' ? (e.ropaTexto.trim() || 'Escribí la ropa abajo') : 'Vestuario a seguir'}</span>}
            </span>
            <span className="vr-cap-l">{ugc ? 'Producto' : 'A seguir'}</span>
          </div>
          <span className="hb-flecha">→</span>
          <div>
            <span className="hb-caja">
              {e.elegida || e.fotos[0] ? <Image src={e.elegida || e.fotos[0]} alt="" fill sizes="40vw" /> : <span className="hb-caja-vacia" style={{ height: '100%' }}>{creandoFoto ? 'Creando…' : ugc ? `${nombre} con el producto` : `${nombre} vestida así`}</span>}
            </span>
            <span className="vr-cap-l">{e.elegida ? '✅ Aprobada' : 'Foto final'}</span>
          </div>
        </div>
        {ugc ? (
          <>
            <div className="lz-chips" style={{ marginTop: 10 }}>
              <button className={`opt ${e.prodUso === 'puesto' ? 'on' : ''}`} onClick={() => set({ prodUso: 'puesto' })}>👕 Lo lleva puesto</button>
              <button className={`opt ${e.prodUso === 'mano' ? 'on' : ''}`} onClick={() => set({ prodUso: 'mano' })}>✋ Lo muestra en la mano</button>
            </div>
            <div className="vr-fotos" style={{ marginBottom: 6 }}>
              <label className="lz-th vr-subir" style={{ width: '100%', height: 'auto', aspectRatio: '3 / 4' }}>
                <input type="file" accept="image/*" onChange={subirProducto} style={{ display: 'none' }} disabled={subiendoRopa} />
                <span>{subiendoRopa ? '…' : '＋'}</span><small>{subiendoRopa ? 'Subiendo' : 'Subir foto'}</small>
              </label>
              {e.prodUrl && !vestidos.some((v) => v.url === e.prodUrl) ? (
                <button className="lz-th on" style={{ width: '100%', height: 'auto', aspectRatio: '3 / 4' }}>
                  <Image src={e.prodUrl} alt="" fill sizes="80px" />
                </button>
              ) : null}
              {vestidos.slice(0, 15).map((v) => (
                <button key={v.url} className={`lz-th ${e.prodUrl === v.url ? 'on' : ''}`} style={{ width: '100%', height: 'auto', aspectRatio: '3 / 4' }} onClick={() => set({ prodUrl: v.url })}>
                  <Image src={v.url} alt="" fill sizes="80px" />
                </button>
              ))}
            </div>
            <p className="vr-nota" style={{ marginTop: 0, marginBottom: 8 }}>La foto del producto va <b>tal cual</b> a la IA: es la que manda (forma, color, costuras, logo). Sale mejor con el producto solo, sobre fondo liso (como en una tienda online).</p>
          </>
        ) : (
          <>
        {e.ropa === 'foto' && e.ropaDesc ? <p className="vr-nota">👗 La IA la vistió con: <i>{e.ropaDesc}</i></p> : null}
        {e.ropa === 'foto' && e.ropaAviso ? <p className="vr-tip" style={{ marginTop: 6 }}>⚠️ {e.ropaAviso}</p> : null}
        <div className="lz-chips" style={{ marginTop: 10 }}>
          <button className={`opt ${e.ropa === 'foto' ? 'on' : ''}`} onClick={() => set({ ropa: 'foto' })}>📷 Foto de la ropa</button>
          <button className={`opt ${e.ropa === 'texto' ? 'on' : ''}`} onClick={() => set({ ropa: 'texto' })}>✏️ Escribirla</button>
        </div>
        {e.ropa === 'foto' ? (
          <>
            <div className="vr-fotos" style={{ marginBottom: 6 }}>
              <label className="lz-th vr-subir" style={{ width: '100%', height: 'auto', aspectRatio: '3 / 4' }}>
                <input type="file" accept="image/*" onChange={subirRopa} style={{ display: 'none' }} disabled={subiendoRopa} />
                <span>{subiendoRopa ? '…' : '＋'}</span><small>{subiendoRopa ? 'Subiendo' : 'Subir foto'}</small>
              </label>
              {vestidos.slice(0, 15).map((v) => (
                <button key={v.url} className={`lz-th ${e.ropaUrl === v.url ? 'on' : ''}`} style={{ width: '100%', height: 'auto', aspectRatio: '3 / 4' }} onClick={() => set({ ropaUrl: v.url, ropaDesc: '' })}>
                  <Image src={v.url} alt="" fill sizes="80px" />
                </button>
              ))}
            </div>
            <p className="vr-nota" style={{ marginTop: 0, marginBottom: 8 }}>Subí la foto del vestuario (de una tienda u otra persona) o elegí uno de tus vestidos.</p>
            <ModoRopa nombre={nombre} />
          </>
        ) : (
          <input className="input" value={e.ropaTexto} onChange={(ev) => set({ ropaTexto: ev.target.value })} placeholder="Ej: buzo gris oversize y short de jean" style={{ width: '100%', boxSizing: 'border-box', marginBottom: 8 }} />
        )}
          </>
        )}
        <textarea className="textarea" value={e.instr} onChange={(ev) => set({ instr: ev.target.value })} placeholder={ugc ? '¿Algo más? (opcional) Ej: remera blanca abajo, pelo suelto' : '¿Algo más? (opcional) Ej: pelo recogido, aros dorados'} style={{ height: 56 }} />
        <div className="vr-fila">
          <select className="input" value={e.fotoModelo} onChange={(ev) => set({ fotoModelo: ev.target.value })} style={{ flex: 1, minWidth: 0 }}>
            <option value="nanopro">Nano Banana Pro ⭐</option>
            <option value="seedream">Seedream 4.5</option>
          </select>
          <button className={`btn-grad ${creandoFoto ? 'busy' : ''}`} disabled={creandoFoto} onClick={crearFoto} style={{ flex: 1.3 }}>
            {creandoFoto ? 'Creando…' : e.fotos.length ? '🔄 Crear otra' : '📸 Crear foto'}
          </button>
        </div>
        {(() => {
          const foto = !!(modelo?.entero || modelo?.medio);
          const med = medidasDe(modelo?.cuerpo, modelo?.promptFijo);
          return foto && med
            ? <p className="vr-nota">🧍 Se usa su cuerpo: foto de {modelo?.entero ? 'cuerpo entero' : 'medio cuerpo'} ✓ · medidas {med} ✓</p>
            : <p className="vr-tip" style={{ marginTop: 6 }}>⚠️ A la ficha de {nombre} le falta {!foto && !med ? 'la foto de cuerpo entero y las medidas' : !foto ? 'la foto de cuerpo entero' : 'las medidas'}: sin eso la IA no sabe cómo es su cuerpo. Cargalo en su ficha (arriba, en Personaje).</p>;
        })()}
        <p className="vr-nota">Es el primer cuadro del video: {ugc ? `${nombre} con el producto, en el lugar y con el encuadre del video de referencia.` : `${nombre} sentada en el escenario, con encuadre de celular.`} {costoFoto === null ? '' : `${fmt(costoFoto)} créditos por foto (${usd(costoFoto)}).`}</p>
        {e.fotos.length ? (
          <>
            <div className="vr-fotos">
              {e.fotos.map((u) => (
                <button key={u} className={`lz-resit ${e.elegida === u ? 'on' : ''}`} onClick={() => set({ elegida: e.elegida === u ? '' : u })}>
                  <Image src={u} alt="" fill sizes="80px" />
                  <span className="lz-ok">{e.elegida === u ? '✅ Aprobada' : 'Aprobar'}</span>
                </button>
              ))}
            </div>
            {!e.elegida ? <p className="vr-nota">👆 Tocá la que te guste para <b>aprobarla</b>.</p> : null}
          </>
        ) : null}
      </div>

      {/* 4. Idioma */}
      <div className="panel vr-paso hb-paso">
        <div className="vr-tit">{n(4)} 🌎 Idioma</div>
        <input className="input" value={e.idioma} onChange={(ev) => set({ idioma: ev.target.value })} placeholder={idiomaDef || IDIOMA_DEFECTO} style={{ width: '100%', boxSizing: 'border-box' }} />
        <div className="vr-fila">
          {e.idioma.trim() && e.idioma.trim() !== idiomaDef
            ? <button className="btn-soft" onClick={guardarIdioma} style={{ flex: 1 }}>⭐ Dejar como predeterminado</button>
            : <p className="vr-nota" style={{ margin: 0 }}>{idiomaDef ? `✓ Predeterminado: ${idiomaDef}` : `Si lo dejás vacío: ${IDIOMA_DEFECTO}.`}</p>}
        </div>
        <p className="vr-nota">Escribilo como quieras: idioma, acento y tono. Ej: “inglés de Texas, relajada”, “español rioplatense, divertida”.</p>
      </div>

      {/* 5. Guion */}
      <div className="panel vr-paso hb-paso" ref={pasoGuion}>
        <div className="vr-tit">{n(5)} ✍️ Guion automático</div>
        <div className="vr-tit chico">⏱️ Duración</div>
        <div className="lz-chips">
          {DURS[e.motor].map((d) => <button key={d} className={`opt ${e.dur === d ? 'on' : ''}`} onClick={() => set({ dur: d })}>{d} s</button>)}
        </div>
        <textarea className="textarea" value={e.tema} onChange={(ev) => set({ tema: ev.target.value })} placeholder={ugc ? '¿Qué producto es y qué tiene de bueno? Ej: campera de cuero negra corta de la marca X, abriga sin ser pesada, combina con todo' : '¿De qué habla? Ej: lo que nadie te dice de mudarte sola a otra ciudad'} style={{ height: 64 }} />
        <input className="input" value={e.extra} onChange={(ev) => set({ extra: ev.target.value })} placeholder={ugc ? 'Nota opcional: público, tono, palabra a evitar…' : 'Nota opcional: público, producto, palabra a evitar…'} style={{ width: '100%', boxSizing: 'border-box', marginTop: 6 }} />
        <button className={`btn-grad ${escribiendo ? 'busy' : ''}`} style={{ width: '100%', marginTop: 8 }} disabled={escribiendo} onClick={escribirGuiones}>
          {escribiendo ? 'Escribiendo… (unos segundos)' : e.guiones.length ? '🔄 Escribir otros 3' : '✨ Escribir 3 guiones'}
        </button>
        <p className="vr-nota">{ugc ? 'Opinión honesta, situación → producto y “mirá esto”: hablan solo de lo que escribiste (no inventan precios, resultados ni experiencias). ' : ''}Gancho para frenar el scroll, desarrollo y cierre, medidos para {e.dur} s. Se cobra en créditos (muy poco); abajo te muestro cuánto costó.{typeof e.guionCred === 'number' ? ` Último: ${fmt(e.guionCred)} créditos.` : ''}</p>
        {errorGuion ? <p className="errbox" style={{ margin: '8px 0 0' }}>{errorGuion}</p> : null}
        {e.guiones.length ? (
          <>
            <p className="vr-nota" style={{ marginTop: 10 }}>👇 Tocá el guion que más te guste para elegirlo.</p>
            <div className="hb-guiones">
              {e.guiones.map((g, i) => (
                <div key={i} role="button" tabIndex={0} className={`hb-guion ${e.guionSel === i ? 'on' : ''}`} onClick={() => elegirGuion(i)} onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') elegirGuion(i); }}>
                  <b>{e.guionSel === i ? '✅ Elegido · ' : ''}{ESTILOS.find((x) => x.id === g.estilo)?.label ?? g.estilo}{g.titulo ? ` · ${g.titulo}` : ''}</b>
                  <p><span className="hb-et">Gancho</span>{g.gancho}</p>
                  <p><span className="hb-et">Desarrollo</span>{g.desarrollo}</p>
                  <p><span className="hb-et">Cierre</span>{g.cierre}</p>
                  {g.traduccion ? <p className="hb-trad">🇦🇷 {g.traduccion}</p> : null}
                </div>
              ))}
            </div>
          </>
        ) : null}
        <div className="vr-tit chico" style={{ marginTop: 12 }}>🗣️ Lo que va a decir <span className="vr-nota" style={{ margin: 0, fontWeight: 600 }}>(podés editarlo o escribirlo vos)</span></div>
        <textarea className="textarea" value={e.texto} onChange={(ev) => set({ texto: ev.target.value })} placeholder="Elegí un guion de arriba o escribí acá lo que dice, en el idioma del video." style={{ height: 90 }} />
        {e.texto.trim() ? (
          <>
            <p className={palabras > max ? 'lz-err' : 'vr-nota'}>{palabras} palabras{palabras > max ? ` · para ${durVideo} s conviene hasta ${max}: si no, va a hablar apurada o se corta.` : ` · entra bien en ${durVideo} s.`}</p>
            <div className="hb-trad-caja">
              <div className="hb-trad-tit">🇦🇷 Traducción</div>
              {e.traduccion && e.traduccionDe === e.texto.trim()
                ? <p>{e.traduccion}</p>
                : (
                  <button className="btn-soft" onClick={traducir} disabled={traduciendo} style={{ width: '100%', padding: '8px 10px', fontSize: 13 }}>
                    {traduciendo ? 'Traduciendo…' : e.traduccion ? '🔄 Traducir de nuevo (cambiaste el texto)' : '🇦🇷 Ver qué dice en español'}
                  </button>
                )}
            </div>
          </>
        ) : null}
        {e.caption && e.texto.trim() ? (
          <div className="vr-fila">
            <p className="vr-nota" style={{ margin: 0, flex: 1 }}>📝 {e.caption}</p>
            <button className="btn-ghost" onClick={copiarCaption} style={{ padding: '6px 10px', fontSize: 12 }}>{copiado ? '✓' : 'Copiar'}</button>
          </div>
        ) : null}
      </div>

      {/* 6. Video */}
      <div className="panel vr-paso hb-paso">
        <div className="vr-tit">{n(6)} 🎬 Video</div>
        <div className="lz-chips">
          <button className={`opt ${e.motor === 'omni' ? 'on' : ''}`} onClick={() => set({ motor: 'omni', dur: durValida('omni', e.dur) })}>Gemini Omni ⭐ · hasta 10 s</button>
          <button className={`opt ${e.motor === 'kling3' ? 'on' : ''}`} onClick={() => set({ motor: 'kling3' })}>Kling 3.0 · más caro</button>
        </div>
        <div className="lz-chips">
          {(['720p', '1080p'] as const).map((c) => <button key={c} className={`opt ${e.calidad === c ? 'on' : ''}`} onClick={() => set({ calidad: c })}>{c}</button>)}
        </div>
        {e.motor === 'kling3' && !voz ? <p className="vr-tip" style={{ marginTop: 4 }}>💡 Sin muestra de voz, Kling elige la voz solo. Subila en el paso 1 para mandarle la voz de {nombre}.</p> : null}
        {e.motor === 'omni' ? (
          <>
            <div className="vr-tit chico">🎙️ Voz (siempre la misma)</div>
            <div className="lz-chips">
              {VOCES_OMNI.map((v) => <button key={v.id} className={`opt ${e.vozOmni === v.id ? 'on' : ''}`} onClick={() => set({ vozOmni: v.id })}>{v.label}</button>)}
            </div>
            <p className="vr-nota">La voz es del catálogo de Omni (no la muestra del paso 1), pero siempre la misma.</p>
          </>
        ) : null}
        {!e.elegida ? <p className="vr-nota">👆 Falta aprobar la foto inicial (paso 3).</p> : null}
        {e.elegida && !e.texto.trim() ? (
          <button className="btn-ghost" style={{ width: '100%', marginTop: 6, fontSize: 13 }} onClick={() => pasoGuion.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
            👆 Falta el guion: elegí uno o escribilo en el paso 5
          </button>
        ) : null}
        <button className={`btn-grad shine ${creandoVideo ? 'busy' : ''}`} style={{ width: '100%', marginTop: 6 }} disabled={creandoVideo || !e.elegida || !e.texto.trim()} onClick={() => setConfirmar(true)}>
          {creandoVideo ? 'Creando video… (unos minutos)' : e.resultado ? '🔄 Crear otro video' : '🎬 Crear video'}
        </button>
        <p className="vr-nota">{estimado ? `Va a costar ≈ ${fmt(estimado.creditos)} créditos (${usd(estimado.creditos)})${estimar(claveVideo, durVideo) ? '' : ', según el precio de lista'}.` : 'El costo exacto lo vas a ver después del primer video con este motor.'}</p>
        {e.resultado ? (
          <div style={{ marginTop: 12 }}>
            <video className="vr-vid" src={e.resultado} controls playsInline preload="metadata" />
            {typeof e.videoCred === 'number' ? <p className="vr-nota">✅ Listo · costó {fmt(e.videoCred)} créditos{typeof e.fotoCred === 'number' ? ` + ${fmt(e.fotoCred)} de la foto` : ''}.</p> : null}
            <div className="vr-fila">
              <button className="btn-soft" onClick={() => onGuardar(e.resultado, 'video')} style={{ flex: 1 }}>⬇ Guardar</button>
              <button className="btn-grad" onClick={() => onPublicar(e.resultado, 'video')} style={{ flex: 1 }}>📤 Publicar</button>
            </div>
            <p className="vr-nota">🏷️ Al publicar, marcalo como contenido hecho con IA (TikTok e Instagram lo piden){ugc ? ' y, si es para una marca, como publicidad o colaboración pagada' : ''}.</p>
          </div>
        ) : null}
      </div>

      {error ? <p className="errbox" style={{ margin: '12px 0' }}>{error}</p> : null}
      <button className="btn-ghost" style={{ width: '100%', marginTop: 12 }} onClick={empezarOtro}>🔁 Empezar otro video</button>
      {confirmar && e.elegida ? (
        <ConfirmarVideo
          foto={e.elegida}
          guion={e.texto}
          dur={durVideo}
          motor={`${e.motor === 'omni' ? 'Gemini Omni' : 'Kling 3.0'} · ${e.calidad}`}
          estimado={estimado}
          saldo={saldo}
          nombre={nombre}
          items={[
            ugc ? `La foto inicial es la que quiero: el producto se ve bien, lugar y encuadre` : `La foto inicial es la que quiero: ropa, lugar y encuadre`,
            `El guion entra en ${durVideo} s sin que hable apurada`,
            e.motor === 'kling3' ? (voz ? `Ya subí la muestra de voz de ${nombre}` : `Sé que sin muestra de voz va a inventar una voz`) : `Elegí la voz de Omni que quiero`,
          ]}
          onCrear={crearVideo}
          onCerrar={() => setConfirmar(false)}
        />
      ) : null}
    </div>
  );
}
