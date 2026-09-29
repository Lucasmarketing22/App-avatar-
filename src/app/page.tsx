'use client';

import { useEffect, useRef, useState } from 'react';

import { componerPrompt } from '@/lib/estudio/prompt';

type Personaje = { nombre: string; refs: string[] };
type Vestido = { id: string; url: string; nombre: string };
type Creacion = { id: string; url: string; ts: number };

type Phase = 'idle' | 'creating' | 'polling' | 'done' | 'error';

const ASPECTS = ['3:4', '1:1', '4:5', '9:16', '16:9', '4:3'];

/* Paleta */
const C = {
  bg: '#faf8f3',
  ink: '#211f26',
  muted: '#6b6772',
  panel: '#fbfaf7',
  line: '#e7e2d8',
  purple: '#4f35e8',
  rose: '#e5397f',
  roseSoft: '#fbe6ef',
};

async function subir(file: File, folder: 'personaje' | 'vestidos'): Promise<string> {
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
  const [vestidos, setVestidos] = useState<Vestido[]>([]);
  const [vestidoSel, setVestidoSel] = useState<string | null>(null);
  const [creaciones, setCreaciones] = useState<Creacion[]>([]);

  const [aspect, setAspect] = useState('3:4');
  const [phase, setPhase] = useState<Phase>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [error, setError] = useState('');
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const [subiendoCara, setSubiendoCara] = useState(false);
  const [subiendoVestido, setSubiendoVestido] = useState(false);
  const [cargando, setCargando] = useState(true);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  /* Carga inicial */
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
      } catch {
        /* si falla, arranca vacío */
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  const busy = phase === 'creating' || phase === 'polling';
  const vestidoActual = vestidos.find((v) => v.id === vestidoSel) ?? null;
  const puedeGenerar = personaje.refs.length > 0 && !!vestidoActual && !busy;

  async function guardarPersonaje(next: Personaje) {
    setPersonaje(next);
    try {
      await fetch('/api/personaje', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
    } catch {
      /* no bloqueamos la UI por esto */
    }
  }

  async function onSubirCara(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;
    setError('');
    setSubiendoCara(true);
    try {
      const libres = Math.max(0, 3 - personaje.refs.length);
      const nuevos: string[] = [];
      for (const f of files.slice(0, libres)) {
        nuevos.push(await subir(f, 'personaje'));
      }
      await guardarPersonaje({ ...personaje, refs: [...personaje.refs, ...nuevos].slice(0, 3) });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir la foto.');
    } finally {
      setSubiendoCara(false);
    }
  }

  async function quitarCara(url: string) {
    await guardarPersonaje({ ...personaje, refs: personaje.refs.filter((u) => u !== url) });
  }

  async function onSubirVestido(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;
    setError('');
    setSubiendoVestido(true);
    try {
      for (const f of files) {
        const url = await subir(f, 'vestidos');
        const res = await fetch('/api/vestidos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        });
        const nuevo = (await res.json()) as Vestido;
        if (res.ok && nuevo?.id) setVestidos((prev) => [nuevo, ...prev]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir el vestido.');
    } finally {
      setSubiendoVestido(false);
    }
  }

  async function borrarVestido(id: string) {
    setVestidos((prev) => prev.filter((v) => v.id !== id));
    if (vestidoSel === id) setVestidoSel(null);
    await fetch(`/api/vestidos?id=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => undefined);
  }

  async function generar() {
    if (!puedeGenerar || !vestidoActual) return;
    setError('');
    setResultUrl(null);
    setPhase('creating');
    setStatusMsg('Enviando el pedido a la IA…');

    const prompt = componerPrompt({ conVestido: true, nombre: personaje.nombre });
    const imageUrls = [...personaje.refs, vestidoActual.url];

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, imageUrls, aspect }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.taskId) {
        setError(data.error ?? 'No se pudo crear la generación.');
        setPhase('error');
        return;
      }
      setPhase('polling');
      setStatusMsg('Generando la imagen… (puede tardar hasta ~1 minuto)');
      poll(data.taskId, 0);
    } catch {
      setError('No se pudo conectar. Probá de nuevo.');
      setPhase('error');
    }
  }

  function poll(taskId: string, tries: number) {
    if (tries > 40) {
      setError('Se tardó demasiado. Probá de nuevo.');
      setPhase('error');
      return;
    }
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/status?taskId=${encodeURIComponent(taskId)}`);
        const data = await res.json().catch(() => ({}));
        if (data.state === 'success') {
          setResultUrl(data.url);
          setPhase('done');
          setStatusMsg('');
          // Guardamos en "Mis creaciones".
          try {
            const r = await fetch('/api/creaciones', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: data.url }),
            });
            const nueva = (await r.json()) as Creacion;
            if (r.ok && nueva?.id) setCreaciones((prev) => [nueva, ...prev]);
          } catch {
            /* la imagen ya se ve igual */
          }
          return;
        }
        if (data.state === 'fail' || (!res.ok && data.error)) {
          setError(data.error ?? 'La generación falló.');
          setPhase('error');
          return;
        }
        poll(taskId, tries + 1);
      } catch {
        poll(taskId, tries + 1);
      }
    }, 3000);
  }

  return (
    <main style={{ minHeight: '100vh', background: C.bg, color: C.ink }}>
      <div style={{ maxWidth: 1040, margin: '0 auto', padding: '28px 18px 72px' }}>
        {/* Encabezado */}
        <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <div style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800, fontSize: 26, letterSpacing: '-0.02em' }}>
            musa<span style={{ color: C.purple }}>.studio</span>
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.rose, background: C.roseSoft, padding: '4px 10px', borderRadius: 999 }}>
            Estudio
          </span>
          <div style={{ flexGrow: 1 }} />
          <button type="button" onClick={() => fetch('/api/logout', { method: 'POST' }).then(() => location.reload())} style={btnGhost}>
            Salir
          </button>
        </header>

        {cargando ? (
          <p style={{ color: C.muted }}>Cargando tu estudio…</p>
        ) : (
          <div style={{ display: 'grid', gap: 22 }}>
            {/* PERSONAJE */}
            <section style={panel}>
              <div style={rowTitle}>
                <h2 style={h2}>Tu personaje</h2>
                <span style={{ color: C.muted, fontSize: 13 }}>La cara que se mantiene igual en todas las fotos (subí 1 a 3).</span>
              </div>

              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                {personaje.refs.map((url) => (
                  <div key={url} style={{ position: 'relative' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="cara del personaje" style={{ width: 96, height: 120, objectFit: 'cover', borderRadius: 12, border: `1px solid ${C.line}` }} />
                    <button type="button" onClick={() => quitarCara(url)} title="Quitar" style={xBtn}>×</button>
                  </div>
                ))}

                {personaje.refs.length < 3 ? (
                  <label style={{ ...uploadTile, width: 96, height: 120 }}>
                    <input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={onSubirCara} style={{ display: 'none' }} />
                    <span style={{ fontSize: 24, color: C.purple, lineHeight: 1 }}>＋</span>
                    <span style={{ fontSize: 12, color: C.muted, marginTop: 4, textAlign: 'center' }}>
                      {subiendoCara ? 'Subiendo…' : 'Subir foto'}
                    </span>
                  </label>
                ) : null}
              </div>

              <div style={{ marginTop: 14 }}>
                <label style={{ fontSize: 13, fontWeight: 700 }}>
                  Nombre (opcional)
                  <input
                    value={personaje.nombre}
                    onChange={(e) => setPersonaje((p) => ({ ...p, nombre: e.target.value }))}
                    onBlur={() => guardarPersonaje(personaje)}
                    placeholder="Ej: Luna"
                    style={{ display: 'block', marginTop: 6, height: 40, width: 220, maxWidth: '100%', boxSizing: 'border-box', borderRadius: 10, border: `1px solid ${C.line}`, padding: '0 12px', fontSize: 14, fontFamily: 'inherit', background: '#fff' }}
                  />
                </label>
              </div>
            </section>

            {/* VESTIDOS */}
            <section style={panel}>
              <div style={rowTitle}>
                <h2 style={h2}>Tus vestidos</h2>
                <span style={{ color: C.muted, fontSize: 13 }}>Tocá un vestido para elegirlo. Subí los tuyos con “＋”.</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 12 }}>
                <label style={{ ...uploadTile, aspectRatio: '3 / 4' }}>
                  <input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={onSubirVestido} style={{ display: 'none' }} />
                  <span style={{ fontSize: 28, color: C.purple, lineHeight: 1 }}>＋</span>
                  <span style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{subiendoVestido ? 'Subiendo…' : 'Subir vestido'}</span>
                </label>

                {vestidos.map((v) => {
                  const sel = v.id === vestidoSel;
                  return (
                    <div
                      key={v.id}
                      onClick={() => setVestidoSel(sel ? null : v.id)}
                      style={{
                        position: 'relative',
                        aspectRatio: '3 / 4',
                        borderRadius: 12,
                        overflow: 'hidden',
                        cursor: 'pointer',
                        border: sel ? `3px solid ${C.rose}` : `1px solid ${C.line}`,
                        boxShadow: sel ? `0 0 0 3px ${C.roseSoft}` : 'none',
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={v.url} alt="vestido" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      {sel ? <span style={selBadge}>Elegido</span> : null}
                      <button
                        type="button"
                        onClick={(ev) => { ev.stopPropagation(); borrarVestido(v.id); }}
                        title="Borrar vestido"
                        style={xBtn}
                      >×</button>
                    </div>
                  );
                })}
              </div>

              {vestidos.length === 0 ? (
                <p style={{ color: C.muted, fontSize: 13, marginTop: 12, marginBottom: 0 }}>
                  Todavía no cargaste vestidos. Tocá “Subir vestido” y elegí una o varias fotos.
                </p>
              ) : null}
            </section>

            {/* GENERAR */}
            <section style={panel}>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <label style={{ fontSize: 13, fontWeight: 700 }}>
                  Formato
                  <select value={aspect} onChange={(e) => setAspect(e.target.value)} style={{ display: 'block', marginTop: 6, height: 44, borderRadius: 10, border: `1px solid ${C.line}`, padding: '0 12px', fontSize: 14, fontFamily: 'inherit', background: '#fff' }}>
                    {ASPECTS.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </label>

                <button type="button" onClick={generar} disabled={!puedeGenerar} style={{ ...btnRose, opacity: puedeGenerar ? 1 : 0.5, cursor: puedeGenerar ? 'pointer' : 'not-allowed' }}>
                  {busy ? 'Generando…' : '✨ Generar imagen'}
                </button>

                {!busy && personaje.refs.length === 0 ? (
                  <span style={{ color: C.muted, fontSize: 13 }}>Primero subí la cara de tu personaje.</span>
                ) : !busy && !vestidoActual ? (
                  <span style={{ color: C.muted, fontSize: 13 }}>Elegí un vestido de la galería.</span>
                ) : null}
              </div>

              {statusMsg ? <p style={{ margin: '12px 0 0', fontSize: 13, color: C.purple }}>{statusMsg}</p> : null}
              {error ? (
                <p style={{ margin: '12px 0 0', fontSize: 13, color: '#c0322b', background: '#fbeceb', border: '1px solid #f3cfcb', borderRadius: 10, padding: '8px 10px' }}>{error}</p>
              ) : null}

              {(busy || resultUrl) ? (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.muted, marginBottom: 8 }}>Resultado</div>
                  {busy ? <div style={{ color: C.muted, fontSize: 14 }}>Generando…</div> : null}
                  {resultUrl ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={resultUrl} alt="resultado" style={{ width: '100%', maxWidth: 360, borderRadius: 14, border: `1px solid ${C.line}` }} />
                      <div style={{ fontSize: 13, color: '#1e6b45', fontWeight: 600, marginTop: 8 }}>✓ Lista y guardada en “Mis creaciones”.</div>
                    </>
                  ) : null}
                </div>
              ) : null}
            </section>

            {/* MIS CREACIONES */}
            {creaciones.length > 0 ? (
              <section style={panel}>
                <div style={rowTitle}><h2 style={h2}>Mis creaciones</h2></div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 12 }}>
                  {creaciones.map((c) => (
                    <a key={c.id} href={c.url} target="_blank" rel="noreferrer" style={{ display: 'block', aspectRatio: '3 / 4', borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.line}` }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={c.url} alt="creación" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    </a>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        )}
      </div>
    </main>
  );
}

/* Estilos reutilizados */
const panel: React.CSSProperties = { background: C.panel, border: `1px solid ${C.line}`, borderRadius: 18, padding: 18 };
const rowTitle: React.CSSProperties = { display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 14 };
const h2: React.CSSProperties = { margin: 0, fontFamily: "'Bricolage Grotesque', sans-serif", fontWeight: 800, fontSize: 18 };
const btnGhost: React.CSSProperties = { border: `1px solid ${C.line}`, background: '#fff', borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', color: C.ink };
const btnRose: React.CSSProperties = { height: 44, borderRadius: 12, border: 'none', background: C.rose, color: '#fff', fontSize: 15, fontWeight: 700, padding: '0 22px', fontFamily: 'inherit' };
const uploadTile: React.CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: `2px dashed ${C.line}`, borderRadius: 12, background: '#fff', cursor: 'pointer' };
const xBtn: React.CSSProperties = { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 999, border: 'none', background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 15, lineHeight: '22px', textAlign: 'center', cursor: 'pointer', padding: 0 };
const selBadge: React.CSSProperties = { position: 'absolute', bottom: 6, left: 6, background: C.rose, color: '#fff', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999 };
