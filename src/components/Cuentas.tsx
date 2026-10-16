'use client';

import { useEffect, useState } from 'react';

/**
 * Panel del administrador: crear cuentas, cargar saldo cuando alguien paga,
 * ver cuánto gastó cada persona y la ganancia del mes. Los montos se ven en
 * dólares (1 crédito = US$ 0,005).
 */
type Fila = { id: string; nombre: string; bloqueada: boolean; creada: number; saldo: number; reservado: number; gastadoMes: number };
type Resumen = { cobradoUsd: number; usadoUsd: number; costoKieUsd: number; saldosUsd: number; kieNecesario: number; kieSaldo: number | null };
type Panel = { cuentas: Fila[]; precios: { multiplicador: number }; resumen: Resumen };
type Mov = { tipo: 'carga' | 'ajuste' | 'reserva' | 'cobro'; ref: string; creditos: number; kie?: number; usd?: number; medio?: string; ts: number };

const USD = 0.005;
const plata = (usd: number) => `US$ ${usd.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const deCred = (cred: number) => plata(cred * USD);
const fecha = (ts: number) => new Date(ts).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const MEDIOS = [{ id: 'binance', label: 'Binance' }, { id: 'mercadopago', label: 'Mercado Pago' }, { id: 'transferencia', label: 'Transferencia' }, { id: 'efectivo', label: 'Efectivo' }, { id: 'otro', label: 'Otro' }];
const TIPO: Record<Mov['tipo'], string> = { carga: '💵 Carga', ajuste: '✏️ Corrección', reserva: '⏳ En proceso', cobro: '🎨 Creación' };

function claveAlAzar(): string {
  const letras = 'abcdefghjkmnpqrstuvwxyz23456789';
  const a = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(a, (n) => letras[n % letras.length]).join('');
}

async function enviar(cuerpo: Record<string, unknown>): Promise<string> {
  try {
    const r = await fetch('/api/cuentas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
    const d = await r.json().catch(() => ({}));
    return r.ok ? '' : (d.error ?? 'No se pudo guardar.');
  } catch {
    return 'No se pudo conectar. Probá de nuevo.';
  }
}

export default function Cuentas() {
  const [panel, setPanel] = useState<Panel | null>(null);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [mult, setMult] = useState('');
  const [nueva, setNueva] = useState({ nombre: '', usuario: '', clave: claveAlAzar() });
  const [abierta, setAbierta] = useState<{ id: string; que: 'cargar' | 'movs' | 'clave' | 'ajustar' } | null>(null);
  const [carga, setCarga] = useState({ cobrado: '', usd: '', medio: 'binance', nota: '' });
  const [ajuste, setAjuste] = useState({ usd: '', nota: '' });
  const [nuevaClave, setNuevaClave] = useState('');
  const [movs, setMovs] = useState<Mov[] | null>(null);

  async function cargar() {
    try {
      const r = await fetch('/api/cuentas', { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) { setError(d.error ?? 'No se pudo leer el panel.'); return; }
      setPanel(d);
      setMult(String(d.precios?.multiplicador ?? 2));
    } catch { setError('No se pudo conectar. Probá de nuevo.'); }
  }
  useEffect(() => { cargar(); }, []);

  async function hacer(cuerpo: Record<string, unknown>, listo: string): Promise<boolean> {
    if (ocupado) return false;
    setOcupado(true); setError(''); setOk('');
    const e = await enviar(cuerpo);
    if (e) setError(e); else { setOk(listo); setAbierta(null); await cargar(); }
    setOcupado(false);
    return !e;
  }

  async function verMovs(id: string) {
    setAbierta({ id, que: 'movs' }); setMovs(null);
    try { const d = await fetch(`/api/cuentas?movs=${encodeURIComponent(id)}`, { cache: 'no-store' }).then((r) => r.json()); setMovs(Array.isArray(d.movimientos) ? d.movimientos : []); } catch { setMovs([]); }
  }

  function abrir(id: string, que: 'cargar' | 'clave' | 'ajustar') {
    setAbierta(abierta?.id === id && abierta.que === que ? null : { id, que });
    setCarga({ cobrado: '', usd: '', medio: 'binance', nota: '' });
    setAjuste({ usd: '', nota: '' });
    setNuevaClave(claveAlAzar());
    setError(''); setOk('');
  }

  if (!panel) return <p className="sub">{error || 'Cargando cuentas…'}</p>;
  const r = panel.resumen;
  const m = panel.precios.multiplicador;
  const multNum = Number(mult.replace(',', '.'));
  const kieFalta = r.kieSaldo !== null && r.kieSaldo < r.kieNecesario;

  return (
    <div className="cta-wrap">
      {error ? <p className="errbox">{error}</p> : null}
      {ok ? <p className="cta-ok">✅ {ok}</p> : null}

      {/* ===== Resumen del mes ===== */}
      <section className="cta-card">
        <h2 className="cta-tit">📊 Este mes</h2>
        <div className="cta-grid">
          <div><span>💵 Te pagaron</span><b>{plata(r.cobradoUsd)}</b></div>
          <div><span>🎨 Usaron en creaciones</span><b>{plata(r.usadoUsd)}</b></div>
          <div><span>🔌 Eso te costó en Kie</span><b>{plata(r.costoKieUsd)}</b></div>
          <div className="cta-gan"><span>✅ Ganancia de lo usado</span><b>{plata(r.usadoUsd - r.costoKieUsd)}</b></div>
        </div>
        <p className="vr-nota">La ganancia ya está en tu Binance o Mercado Pago (es parte de lo que te pagaron). A esto restale Vercel y las comisiones.</p>
        <div className={`cta-kie ${kieFalta ? 'mal' : ''}`}>
          <b>⏳ Saldo sin usar de tus cuentas: {plata(r.saldosUsd)}</b>
          <span>
            Cuando lo usen te va a costar en Kie ≈ {Math.ceil(r.kieNecesario).toLocaleString('es-AR')} créditos ({deCred(r.kieNecesario)}).{' '}
            {r.kieSaldo === null ? 'No pude leer tu saldo de Kie.' : kieFalta
              ? <>Tenés {Math.floor(r.kieSaldo).toLocaleString('es-AR')}: <b>cargá al menos {deCred(r.kieNecesario - r.kieSaldo)} en Kie</b> para que no se corten.</>
              : <>Tenés {Math.floor(r.kieSaldo).toLocaleString('es-AR')} en Kie ✅ alcanza.</>}
          </span>
        </div>
      </section>

      {/* ===== Precio ===== */}
      <section className="cta-card">
        <h2 className="cta-tit">🏷️ Tu precio</h2>
        <p className="vr-nota" style={{ marginTop: 0 }}>Cada creación les cuesta lo que cobra Kie multiplicado por este número. Por ejemplo, con ×{m}: un video hablado de 8 s (a vos te cuesta US$ 0,53) les cuesta {plata(0.525 * m)}.</p>
        <div className="cta-fila">
          <span style={{ fontWeight: 700 }}>× </span>
          <input className="input" inputMode="decimal" value={mult} onChange={(e) => setMult(e.target.value)} style={{ width: 90 }} />
          <button className="btn-soft" disabled={ocupado || !Number.isFinite(multNum) || multNum === m} onClick={() => hacer({ accion: 'precios', multiplicador: multNum }, 'Precio guardado.')}>Guardar</button>
        </div>
        <p className="vr-nota">Cambiarlo afecta solo lo que creen desde ahora.</p>
      </section>

      {/* ===== Nueva cuenta ===== */}
      <section className="cta-card">
        <h2 className="cta-tit">➕ Nueva cuenta</h2>
        <div className="cta-form">
          <input className="input" placeholder="Nombre (ej: Paola)" value={nueva.nombre} onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })} />
          <input className="input" placeholder="Usuario para entrar (ej: paola)" autoCapitalize="none" autoCorrect="off" value={nueva.usuario} onChange={(e) => setNueva({ ...nueva, usuario: e.target.value })} />
          <div className="cta-fila">
            <input className="input" placeholder="Contraseña" value={nueva.clave} onChange={(e) => setNueva({ ...nueva, clave: e.target.value })} style={{ flex: 1 }} />
            <button className="btn-soft" onClick={() => setNueva({ ...nueva, clave: claveAlAzar() })}>🎲 Otra</button>
          </div>
          <button className="btn-grad" disabled={ocupado || !nueva.usuario.trim() || nueva.clave.length < 6}
            onClick={() => hacer({ accion: 'crear', ...nueva }, `Cuenta creada. Pasale a ${nueva.nombre || nueva.usuario} su usuario y su contraseña: ${nueva.clave}`).then((bien) => { if (bien) setNueva({ nombre: '', usuario: '', clave: claveAlAzar() }); })}>
            Crear cuenta
          </button>
          <p className="vr-nota">Arranca con saldo US$ 0. Anotá la contraseña antes de crearla: después no se puede ver, solo cambiar.</p>
        </div>
      </section>

      {/* ===== Cuentas ===== */}
      <h2 className="cta-tit" style={{ margin: '18px 0 8px' }}>👥 Cuentas ({panel.cuentas.length})</h2>
      {panel.cuentas.length === 0 ? <p className="sub">Todavía no creaste ninguna.</p> : null}
      {panel.cuentas.map((c) => {
        const a = abierta?.id === c.id ? abierta.que : null;
        const usd = Number(carga.usd.replace(',', '.'));
        const cobrado = carga.cobrado.trim() === '' ? usd : Number(carga.cobrado.replace(',', '.'));
        return (
          <section key={c.id} className={`cta-card ${c.bloqueada ? 'pausada' : ''}`}>
            <div className="cta-cab">
              <div><b>{c.nombre}</b> <span className="cta-user">@{c.id}</span>{c.bloqueada ? <span className="cta-tag">⏸️ Pausada</span> : null}</div>
              <div className="cta-saldo">{deCred(c.saldo)}<span>saldo</span></div>
            </div>
            <p className="vr-nota" style={{ margin: '2px 0 8px' }}>Gastó este mes {deCred(c.gastadoMes)}{c.reservado > 0 ? ` · ${deCred(c.reservado)} en creaciones en proceso` : ''}</p>
            <div className="cta-botones">
              <button className="btn-soft" onClick={() => abrir(c.id, 'cargar')}>💵 Cargar saldo</button>
              <button className="btn-soft" onClick={() => (a === 'movs' ? setAbierta(null) : verMovs(c.id))}>📋 Movimientos</button>
              <button className="btn-soft" onClick={() => abrir(c.id, 'ajustar')}>✏️ Corregir</button>
              <button className="btn-soft" onClick={() => abrir(c.id, 'clave')}>🔑 Contraseña</button>
              <button className="btn-soft" disabled={ocupado} onClick={() => hacer({ accion: 'bloquear', id: c.id, bloqueada: !c.bloqueada }, c.bloqueada ? `${c.nombre} puede volver a entrar.` : `${c.nombre} quedó pausada: no puede entrar ni crear.`)}>{c.bloqueada ? '▶️ Reactivar' : '⏸️ Pausar'}</button>
            </div>

            {a === 'cargar' ? (
              <div className="cta-form">
                <label className="cta-lbl">¿Cuánto te pagó? (US$)<input className="input" inputMode="decimal" placeholder="15" value={carga.cobrado} onChange={(e) => setCarga({ ...carga, cobrado: e.target.value, usd: carga.usd === '' || carga.usd === carga.cobrado ? e.target.value : carga.usd })} /></label>
                <label className="cta-lbl">¿Cuánto saldo le cargás? (US$)<input className="input" inputMode="decimal" placeholder="15" value={carga.usd} onChange={(e) => setCarga({ ...carga, usd: e.target.value })} /></label>
                <label className="cta-lbl">¿Por dónde te pagó?
                  <select className="select" value={carga.medio} onChange={(e) => setCarga({ ...carga, medio: e.target.value })}>{MEDIOS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
                </label>
                <input className="input" placeholder="Nota (opcional)" value={carga.nota} onChange={(e) => setCarga({ ...carga, nota: e.target.value })} />
                <button className="btn-grad" disabled={ocupado || !(usd > 0) || !(cobrado >= 0)}
                  onClick={() => hacer({ accion: 'cargar', id: c.id, usd, cobrado, medio: carga.medio, nota: carga.nota }, `Le cargaste ${plata(usd)} a ${c.nombre}.`)}>
                  Cargar {usd > 0 ? plata(usd) : ''}
                </button>
                <p className="vr-nota">Normalmente es lo mismo que te pagó. Si le regalás saldo, poné 0 en lo que te pagó.</p>
              </div>
            ) : null}

            {a === 'ajustar' ? (
              <div className="cta-form">
                <label className="cta-lbl">Sumar (ej: 2) o restar (ej: -2), en US$<input className="input" inputMode="text" placeholder="-2" value={ajuste.usd} onChange={(e) => setAjuste({ ...ajuste, usd: e.target.value })} /></label>
                <input className="input" placeholder="Motivo (ej: me equivoqué al cargar)" value={ajuste.nota} onChange={(e) => setAjuste({ ...ajuste, nota: e.target.value })} />
                <button className="btn-grad" disabled={ocupado || !Number(ajuste.usd.replace(',', '.'))}
                  onClick={() => hacer({ accion: 'ajustar', id: c.id, usd: Number(ajuste.usd.replace(',', '.')), nota: ajuste.nota }, 'Saldo corregido.')}>Corregir saldo</button>
                <p className="vr-nota">Para errores de carga. No cuenta como un pago en tu resumen.</p>
              </div>
            ) : null}

            {a === 'clave' ? (
              <div className="cta-form">
                <div className="cta-fila">
                  <input className="input" value={nuevaClave} onChange={(e) => setNuevaClave(e.target.value)} style={{ flex: 1 }} />
                  <button className="btn-soft" onClick={() => setNuevaClave(claveAlAzar())}>🎲 Otra</button>
                </div>
                <button className="btn-grad" disabled={ocupado || nuevaClave.length < 6} onClick={() => hacer({ accion: 'clave', id: c.id, clave: nuevaClave }, `Contraseña nueva de ${c.nombre}: ${nuevaClave}`)}>Cambiar contraseña</button>
                <p className="vr-nota">Tiene que volver a entrar con la contraseña nueva.</p>
              </div>
            ) : null}

            {a === 'movs' ? (
              <div className="cta-movs">
                {movs === null ? <p className="vr-nota">Cargando…</p> : movs.length === 0 ? <p className="vr-nota">Sin movimientos todavía.</p> : movs.map((x, i) => (
                  <div key={`${x.ref}-${i}`} className="cta-mov">
                    <span>{TIPO[x.tipo]}{x.tipo === 'carga' && x.medio ? ` · ${MEDIOS.find((y) => y.id === x.medio)?.label ?? x.medio}` : ''}<br /><small>{fecha(x.ts)}{x.tipo === 'carga' && typeof x.usd === 'number' ? ` · te pagó ${plata(x.usd)}` : ''}{x.tipo === 'cobro' && typeof x.kie === 'number' ? ` · a vos te costó ${deCred(x.kie)}` : ''}</small></span>
                    <b className={x.tipo === 'carga' || (x.tipo === 'ajuste' && x.creditos > 0) ? 'mas' : 'menos'}>{x.tipo === 'carga' || x.tipo === 'ajuste' ? (x.creditos >= 0 ? '+' : '−') : '−'}{deCred(Math.abs(x.creditos))}</b>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
