'use client';

import { useEffect, useRef, useState } from 'react';

/** Voz fija de una modelo (modelo de voz de Fish Audio). */
export type VozModelo = { ref: string; nombre?: string; muestra?: string };

type VozLib = { id: string; titulo: string; desc: string; tags: string[]; usos: number; muestra: string };
type Opcion = { url: string; texto: string; firma: string | null };
type Audio = { id: string; url: string; ts: number };

const EJEMPLOS = [
  'Mujer joven argentina, voz suave y sensual, tono cálido, un poco ronca, habla despacio y cerca del micrófono',
  'Chica de 25 años, alegre y coqueta, voz dulce y fresca, acento rioplatense',
  'Mujer segura y seductora, voz grave y aterciopelada, susurra al final de las frases',
];

const TAG_ES: Record<string, string> = {
  female: 'mujer', male: 'hombre', young: 'joven', old: 'mayor', 'middle-aged': 'adulta', calm: 'calma', soft: 'suave',
  sexy: 'sexy', seductive: 'seductora', sweet: 'dulce', warm: 'cálida', narration: 'narración', energetic: 'enérgica',
  cheerful: 'alegre', deep: 'grave', whisper: 'susurro', breathy: 'aireada', Spanish: 'español', English: 'inglés',
};

/**
 * Sección de voz: la voz fija de la modelo (elegida de la biblioteca de Fish
 * Audio, creada con una descripción o pegando un ID) + generar audios.
 */
export default function VozEstudio(props: {
  modeloNombre: string;
  voz?: VozModelo;
  onGuardarVoz: (v: VozModelo | undefined) => Promise<void>;
  onTrabajo: (msg: string) => void;
}) {
  const { modeloNombre, voz, onGuardarVoz, onTrabajo } = props;
  const nombre = modeloNombre || 'tu modelo';

  const [cargada, setCargada] = useState(false);
  const [hayClave, setHayClave] = useState(true);
  const [vozVieja, setVozVieja] = useState<{ reference_id?: string; nombre?: string }>({});
  const [audios, setAudios] = useState<Audio[]>([]);
  const [tab, setTab] = useState<'biblio' | 'crear' | 'id'>('biblio');
  const [err, setErr] = useState('');

  // Reproductor único (uno suena a la vez).
  const player = useRef<HTMLAudioElement | null>(null);
  const [sonando, setSonando] = useState('');
  function tocar(url: string) {
    if (!player.current) {
      player.current = new Audio();
      player.current.onended = () => setSonando('');
    }
    const a = player.current;
    if (sonando === url) { a.pause(); setSonando(''); return; }
    a.src = url; a.play().then(() => setSonando(url)).catch(() => setSonando(''));
  }
  useEffect(() => () => { player.current?.pause(); }, []);

  useEffect(() => {
    (async () => {
      try {
        const d = await fetch('/api/voz').then((r) => r.json());
        setHayClave(!!d.configured);
        setVozVieja(d.voz ?? {});
        if (Array.isArray(d.items)) setAudios(d.items);
      } catch { /* */ } finally { setCargada(true); }
    })();
  }, []);

  // ----- Biblioteca -----
  const [q, setQ] = useState('');
  const [idioma, setIdioma] = useState<'es' | 'en' | ''>('es');
  const [genero, setGenero] = useState<'female' | 'male' | ''>('female');
  const [lib, setLib] = useState<VozLib[]>([]);
  const [pagina, setPagina] = useState(1);
  const [hayMas, setHayMas] = useState(false);
  const [buscando, setBuscando] = useState(false);
  async function buscar(pag = 1) {
    setBuscando(true); setErr('');
    try {
      const p = new URLSearchParams({ q, idioma, genero, pagina: String(pag) });
      const d = await fetch(`/api/voz/biblioteca?${p}`).then((r) => r.json());
      if (d.error) { setErr(d.error); return; }
      setLib((prev) => (pag === 1 ? d.items : [...prev, ...d.items.filter((x: VozLib) => !prev.some((y) => y.id === x.id))]));
      setPagina(pag); setHayMas(!!d.hayMas);
    } catch { setErr('No se pudo cargar la biblioteca de voces.'); } finally { setBuscando(false); }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === 'biblio') buscar(1); }, [idioma, genero, tab]);

  const [guardando, setGuardando] = useState('');
  async function elegir(v: VozModelo) {
    setGuardando(v.ref); setErr('');
    try { await onGuardarVoz(v); } catch { setErr('No se pudo guardar la voz.'); } finally { setGuardando(''); }
  }

  // ----- Crear con descripción -----
  const [desc, setDesc] = useState('');
  const [opciones, setOpciones] = useState<Opcion[]>([]);
  const [creando, setCreando] = useState(false);
  const [fijando, setFijando] = useState('');
  async function crearOpciones() {
    if (creando || desc.trim().length < 5) return;
    setCreando(true); setErr(''); setOpciones([]); onTrabajo('Creando 3 opciones de voz…');
    try {
      const res = await fetch('/api/voz/disenar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ instruccion: desc.trim() }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(d.opciones)) { setErr(d.error ?? 'No se pudieron crear las voces.'); return; }
      setOpciones(d.opciones);
    } catch { setErr('No se pudo conectar.'); } finally { setCreando(false); onTrabajo(''); }
  }
  async function fijarOpcion(o: Opcion, i: number) {
    if (fijando) return;
    setFijando(o.url); setErr(''); onTrabajo('Guardando la voz elegida…');
    const n = `Voz de ${nombre} (${i + 1})`;
    try {
      const res = await fetch('/api/voz/crear', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ audioUrl: o.url, texto: o.texto, firma: o.firma, nombre: n }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.id) { setErr(d.error ?? 'No se pudo guardar la voz.'); return; }
      await onGuardarVoz({ ref: d.id, nombre: n, muestra: o.url });
      setOpciones([]);
    } catch { setErr('No se pudo conectar.'); } finally { setFijando(''); onTrabajo(''); }
  }

  // ----- Pegar un ID a mano -----
  const [idManual, setIdManual] = useState('');

  // ----- Generar audio -----
  const [texto, setTexto] = useState('');
  const [generando, setGenerando] = useState(false);
  async function generar() {
    if (generando || !texto.trim()) return;
    setGenerando(true); setErr(''); onTrabajo(`Generando la voz de ${nombre}…`);
    try {
      const res = await fetch('/api/voz', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: texto.trim(), ref: voz?.ref }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.url) { setErr(d.error ?? 'No se pudo generar.'); return; }
      setAudios((prev) => [{ id: d.url, url: d.url, ts: Date.now() }, ...prev]);
      tocar(d.url);
    } catch { setErr('No se pudo conectar.'); } finally { setGenerando(false); onTrabajo(''); }
  }
  async function borrar(a: Audio) {
    setAudios((prev) => prev.filter((x) => x.id !== a.id));
    try { await fetch(`/api/voz?url=${encodeURIComponent(a.url)}`, { method: 'DELETE' }); } catch { /* */ }
  }

  if (!cargada) return <p className="sub">Cargando…</p>;

  const vozActual = voz?.ref ? voz : vozVieja.reference_id ? { ref: vozVieja.reference_id, nombre: vozVieja.nombre || 'Voz guardada' } : undefined;
  const tagsEs = (t: string[]) => t.map((x) => TAG_ES[x] ?? x).filter((x) => x.length < 16).slice(0, 4);

  return (
    <>
      {!hayClave ? (
        <div className="panel" style={{ marginBottom: 16, borderColor: '#f3cfcb', background: 'var(--err-soft)' }}>
          <div className="h2" style={{ marginBottom: 6 }}>Falta activar la voz</div>
          <p className="sub" style={{ marginTop: 0 }}>Para crear audios, cargá tu <b>API key de fish.audio</b> en <b>Vercel</b> como variable <b>FISH_AUDIO_API_KEY</b> (Settings → Environment Variables → Add New → Save → Redeploy). ¡Nunca la pegues en el chat! La biblioteca de voces sí se puede mirar igual.</p>
        </div>
      ) : null}

      {/* Voz actual */}
      <div className="panel vz-actual" style={{ marginBottom: 16 }}>
        <div className="vz-ic">🎙️</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="sub" style={{ fontSize: 12, margin: 0 }}>Voz de {nombre}</div>
          <div className="h2" style={{ margin: 0, fontSize: 17 }}>{vozActual ? vozActual.nombre || 'Voz elegida' : 'Todavía sin voz'}</div>
          {!vozActual ? <div className="sub" style={{ fontSize: 12, margin: '2px 0 0' }}>Elegí una abajo: de la biblioteca o creada con una descripción.</div> : null}
        </div>
        {vozActual && 'muestra' in vozActual && vozActual.muestra ? (
          <button className="vz-play" onClick={() => tocar(vozActual.muestra as string)} aria-label="Escuchar">{sonando === vozActual.muestra ? '⏸' : '▶'}</button>
        ) : null}
      </div>

      {/* Elegir / crear voz */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="vz-tabs">
          <button className={`opt ${tab === 'biblio' ? 'on' : ''}`} onClick={() => setTab('biblio')}>📚 Biblioteca</button>
          <button className={`opt ${tab === 'crear' ? 'on' : ''}`} onClick={() => setTab('crear')}>✨ Crear voz</button>
          <button className={`opt ${tab === 'id' ? 'on' : ''}`} onClick={() => setTab('id')}>🔗 Fish</button>
        </div>

        {tab === 'biblio' ? (
          <>
            <form onSubmit={(e) => { e.preventDefault(); buscar(1); }} style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar: sensual, dulce, argentina…" style={{ flex: 1, minWidth: 0 }} />
              <button className="btn-soft" type="submit">Buscar</button>
            </form>
            <div className="vz-filtros">
              <button className={`opt ${idioma === 'es' ? 'on' : ''}`} onClick={() => setIdioma('es')}>Español</button>
              <button className={`opt ${idioma === 'en' ? 'on' : ''}`} onClick={() => setIdioma('en')}>Inglés</button>
              <button className={`opt ${idioma === '' ? 'on' : ''}`} onClick={() => setIdioma('')}>Todos</button>
              <span className="vz-sep" />
              <button className={`opt ${genero === 'female' ? 'on' : ''}`} onClick={() => setGenero('female')}>Mujer</button>
              <button className={`opt ${genero === 'male' ? 'on' : ''}`} onClick={() => setGenero('male')}>Hombre</button>
              <button className={`opt ${genero === '' ? 'on' : ''}`} onClick={() => setGenero('')}>Todas</button>
            </div>
            <div className="vz-lista">
              {lib.map((v) => {
                const elegida = vozActual?.ref === v.id;
                return (
                  <div key={v.id} className={`vz-item ${elegida ? 'on' : ''}`}>
                    <button className="vz-play" onClick={() => tocar(v.muestra)} aria-label={`Escuchar ${v.titulo}`}>{sonando === v.muestra ? '⏸' : '▶'}</button>
                    <div className="vz-tx">
                      <b>{v.titulo}</b>
                      {v.desc ? <span className="vz-desc">{v.desc}</span> : null}
                      <span className="vz-tags">{tagsEs(v.tags).map((t) => <i key={t}>{t}</i>)}</span>
                    </div>
                    <button className={elegida ? 'btn-soft' : 'btn-grad'} disabled={elegida || !!guardando} onClick={() => elegir({ ref: v.id, nombre: v.titulo, muestra: v.muestra })}>
                      {elegida ? '✓ Elegida' : guardando === v.id ? '…' : 'Elegir'}
                    </button>
                  </div>
                );
              })}
              {buscando ? <p className="sub" style={{ textAlign: 'center' }}>Buscando voces…</p> : null}
              {!buscando && !lib.length ? <p className="sub" style={{ textAlign: 'center' }}>No encontré voces con esa búsqueda.</p> : null}
              {!buscando && hayMas && lib.length ? <button className="btn-soft" style={{ width: '100%' }} onClick={() => buscar(pagina + 1)}>Ver más voces</button> : null}
            </div>
          </>
        ) : tab === 'crear' ? (
          <>
            <p className="sub" style={{ margin: '12px 0 8px' }}>Describí cómo querés que suene {nombre}: edad, tono, acento, actitud. Te armo <b>3 opciones</b> para escuchar y elegís una.</p>
            <textarea className="textarea" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ej: mujer joven argentina, voz suave y sensual, tono cálido…" style={{ height: 90 }} />
            <div className="vz-ejemplos">
              {EJEMPLOS.map((e) => <button key={e} className="vz-ej" onClick={() => setDesc(e)}>{e}</button>)}
            </div>
            <button className={`btn-grad shine ${creando ? 'busy' : ''}`} style={{ width: '100%', marginTop: 10 }} disabled={creando || desc.trim().length < 5 || !hayClave} onClick={crearOpciones}>
              {creando ? 'Creando opciones…' : '✨ Crear 3 opciones de voz'}
            </button>
            <p className="costo">Gasta crédito de Fish Audio (se cobra una vez por pedido, no por opción).</p>
            {opciones.length ? (
              <div className="vz-lista">
                {opciones.map((o, i) => (
                  <div key={o.url} className="vz-item">
                    <button className="vz-play" onClick={() => tocar(o.url)} aria-label={`Escuchar opción ${i + 1}`}>{sonando === o.url ? '⏸' : '▶'}</button>
                    <div className="vz-tx"><b>Opción {i + 1}</b><span className="vz-desc">“{o.texto}”</span></div>
                    <button className="btn-grad" disabled={!!fijando} onClick={() => fijarOpcion(o, i)}>{fijando === o.url ? 'Guardando…' : 'Elegir esta'}</button>
                  </div>
                ))}
                <p className="sub" style={{ fontSize: 12, margin: 0 }}>¿Ninguna te convence? Cambiá la descripción y creá otras.</p>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <p className="sub" style={{ margin: '12px 0 8px' }}>Buscá voces directo en la página de Fish Audio. Cuando encuentres una, copiá su <b>ID</b> (está en el link de la voz, el código largo) y pegalo acá.</p>
            <a className="btn-grad" href="https://fish.audio/discovery/" target="_blank" rel="noreferrer" style={{ display: 'inline-block', textDecoration: 'none' }}>🔗 Abrir Fish Audio</a>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <input className="input" value={idManual} onChange={(e) => setIdManual(e.target.value)} placeholder="Pegá el ID de la voz" style={{ flex: 1, minWidth: 0 }} />
              <button className="btn-soft" disabled={!/^[A-Za-z0-9_-]{6,80}$/.test(idManual.trim())} onClick={() => elegir({ ref: idManual.trim(), nombre: 'Voz de Fish Audio' }).then(() => setIdManual(''))}>Guardar</button>
            </div>
          </>
        )}
        {err ? <p className="errbox" style={{ margin: '12px 0 0' }}>{err}</p> : null}
      </div>

      {/* Generar audio */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="h2" style={{ marginBottom: 6 }}>🗣️ Que {nombre} diga algo</div>
        <textarea className="textarea" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={`Escribí lo que querés que diga ${nombre}…`} style={{ height: 100 }} />
        <button className={`btn-grad shine ${generando ? 'busy' : ''}`} style={{ marginTop: 10, width: '100%' }} disabled={generando || !texto.trim() || !hayClave} onClick={generar}>
          {generando ? 'Generando…' : `🎙️ Generar con la voz de ${nombre}`}
        </button>
        {!vozActual ? <p className="sub" style={{ fontSize: 12, margin: '8px 0 0' }}>Sin voz elegida usa una voz por defecto de Fish Audio.</p> : null}
      </div>

      <div className="h2" style={{ marginBottom: 10 }}>Mis audios ({audios.length})</div>
      {audios.length === 0 ? (
        <div className="panel"><p className="sub" style={{ margin: 0 }}>Todavía no generaste audios.</p></div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {audios.map((a) => (
            <div key={a.id} className="panel" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px' }}>
              <audio src={a.url} controls preload="metadata" style={{ flex: 1, minWidth: 0 }} />
              <a className="btn-soft" href={a.url} target="_blank" rel="noreferrer">⬇</a>
              <button className="btn-soft" onClick={() => borrar(a)}>🗑️</button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
