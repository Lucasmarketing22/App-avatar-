import { NextResponse } from 'next/server';

import { idCuentaValido, picarClave } from '@/lib/auth';
import { esAdmin } from '@/lib/cuenta';
import { guardarCuenta, leerCuenta, listarCuentas, normalizarUsuario, type Cuenta } from '@/lib/cuentas';
import { getCredits } from '@/lib/ia/kie';
import { ajustarSaldo, calcularSaldo, cargarSaldo, guardarPrecios, leerMov, leerPrecios, movimientos, USD_POR_CREDITO, type Mov } from '@/lib/saldo';
import { listarTodo } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO = () => NextResponse.json({ error: 'Solo el administrador puede ver esto.' }, { status: 403 });
const MEDIOS = ['binance', 'mercadopago', 'transferencia', 'efectivo', 'otro'];

/**
 * Panel del administrador: cuentas, saldos y resumen de ganancias.
 * GET            → todo el panel.
 * GET ?movs=<id> → movimientos de una cuenta.
 */
export async function GET(request: Request) {
  if (!esAdmin()) return NO();
  const movsDe = new URL(request.url).searchParams.get('movs');
  if (movsDe) {
    if (!idCuentaValido(movsDe)) return NextResponse.json({ error: 'Cuenta inválida.' }, { status: 400 });
    const lista = await movimientos(movsDe);
    return NextResponse.json({ movimientos: lista.slice(0, 200).map(({ url: _u, ...m }) => m) });
  }

  const [cuentas, precios, todos, kie] = await Promise.all([listarCuentas(), leerPrecios(), listarTodo('saldo/'), getCredits()]);
  // Todos los movimientos de todas las cuentas, en una sola consulta.
  const porCuenta = new Map<string, Mov[]>();
  for (const b of todos) {
    const id = b.pathname.split('/')[1];
    const m = leerMov(b.pathname, b.url, b.uploadedAt);
    if (id && m) porCuenta.set(id, [...(porCuenta.get(id) ?? []), m]);
  }

  const inicioMes = new Date();
  inicioMes.setUTCDate(1); inicioMes.setUTCHours(3, 0, 0, 0); // 00:00 de Argentina (UTC-3)
  if (inicioMes.getTime() > Date.now()) inicioMes.setUTCMonth(inicioMes.getUTCMonth() - 1);
  const desde = inicioMes.getTime();

  let cobradoMes = 0; let usadoMes = 0; let costoKieMes = 0; let saldosTotal = 0;
  const filas = cuentas.map((c: Cuenta) => {
    const movs = porCuenta.get(c.id) ?? [];
    const { saldo, reservado } = calcularSaldo(movs);
    let gastadoMes = 0;
    for (const m of movs) {
      if (m.ts < desde) continue;
      if (m.tipo === 'carga') cobradoMes += m.usd ?? 0;
      if (m.tipo === 'cobro') { gastadoMes += m.creditos; usadoMes += m.creditos; costoKieMes += m.kie ?? 0; }
    }
    saldosTotal += Math.max(0, saldo);
    return { id: c.id, nombre: c.nombre, bloqueada: c.bloqueada, creada: c.creada, saldo, reservado, gastadoMes };
  });

  return NextResponse.json({
    cuentas: filas,
    precios,
    resumen: {
      cobradoUsd: cobradoMes,
      usadoUsd: usadoMes * USD_POR_CREDITO,
      costoKieUsd: costoKieMes * USD_POR_CREDITO,
      saldosUsd: saldosTotal * USD_POR_CREDITO,
      // Lo que te va a costar en Kie cuando usen todo el saldo que ya tienen cargado.
      kieNecesario: saldosTotal / precios.multiplicador,
      kieSaldo: kie,
    },
  });
}

type Pedido = {
  accion?: string; id?: string; usuario?: string; nombre?: string; clave?: string;
  usd?: number; cobrado?: number; medio?: string; nota?: string; bloqueada?: boolean; multiplicador?: number;
};

/** Acciones del panel: crear cuenta, cargar o ajustar saldo, cambiar clave, pausar y precios. */
export async function POST(request: Request) {
  if (!esAdmin()) return NO();
  const b = (await request.json().catch(() => null)) as Pedido | null;
  const nota = typeof b?.nota === 'string' ? b.nota.trim() : '';

  if (b?.accion === 'precios') {
    const m = Number(b.multiplicador);
    if (!Number.isFinite(m) || m < 1 || m > 20) return NextResponse.json({ error: 'El multiplicador tiene que estar entre 1 y 20.' }, { status: 400 });
    const r = await guardarPrecios({ multiplicador: Math.round(m * 100) / 100 });
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error ?? 'No se pudo guardar.' }, { status: 500 });
  }

  if (b?.accion === 'crear') {
    const id = normalizarUsuario(String(b.usuario ?? ''));
    const nombre = String(b.nombre ?? '').trim().slice(0, 60) || id;
    const clave = String(b.clave ?? '');
    if (!idCuentaValido(id)) return NextResponse.json({ error: 'Usuario inválido: usá letras y números (mínimo 2), sin espacios. "admin" no se puede usar.' }, { status: 400 });
    if (clave.length < 6) return NextResponse.json({ error: 'La contraseña tiene que tener al menos 6 caracteres.' }, { status: 400 });
    if (await leerCuenta(id)) return NextResponse.json({ error: `Ya existe una cuenta "${id}".` }, { status: 400 });
    const { sal, hash } = await picarClave(clave);
    const r = await guardarCuenta({ id, nombre, sal, hash, version: 1, bloqueada: false, creada: Date.now() });
    return r.ok ? NextResponse.json({ ok: true, id }) : NextResponse.json({ error: r.error ?? 'No se pudo crear.' }, { status: 500 });
  }

  const cuenta = idCuentaValido(b?.id) ? await leerCuenta(b!.id!) : null;
  if (!cuenta) return NextResponse.json({ error: 'Esa cuenta no existe.' }, { status: 404 });

  if (b?.accion === 'cargar') {
    const usd = Number(b.usd);
    const cobrado = b.cobrado === undefined || b.cobrado === null ? usd : Number(b.cobrado);
    if (!Number.isFinite(usd) || usd <= 0 || usd > 10000) return NextResponse.json({ error: 'Poné cuánto saldo cargar (en US$).' }, { status: 400 });
    if (!Number.isFinite(cobrado) || cobrado < 0 || cobrado > 10000) return NextResponse.json({ error: 'Poné cuánto te pagó (en US$).' }, { status: 400 });
    const medio = MEDIOS.includes(String(b.medio)) ? String(b.medio) : 'otro';
    const r = await cargarSaldo(cuenta.id, usd / USD_POR_CREDITO, cobrado, medio, nota);
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error ?? 'No se pudo cargar.' }, { status: 500 });
  }

  if (b?.accion === 'ajustar') {
    const usd = Number(b.usd);
    if (!Number.isFinite(usd) || usd === 0 || Math.abs(usd) > 10000) return NextResponse.json({ error: 'Poné cuánto sumar o restar (en US$).' }, { status: 400 });
    const r = await ajustarSaldo(cuenta.id, usd / USD_POR_CREDITO, nota);
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error ?? 'No se pudo ajustar.' }, { status: 500 });
  }

  if (b?.accion === 'clave') {
    const clave = String(b.clave ?? '');
    if (clave.length < 6) return NextResponse.json({ error: 'La contraseña tiene que tener al menos 6 caracteres.' }, { status: 400 });
    const { sal, hash } = await picarClave(clave);
    const r = await guardarCuenta({ ...cuenta, sal, hash, version: cuenta.version + 1 });
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error ?? 'No se pudo cambiar.' }, { status: 500 });
  }

  if (b?.accion === 'bloquear') {
    const bloqueada = !!b.bloqueada;
    const r = await guardarCuenta({ ...cuenta, bloqueada, version: bloqueada ? cuenta.version + 1 : cuenta.version });
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error ?? 'No se pudo guardar.' }, { status: 500 });
  }

  return NextResponse.json({ error: 'Acción desconocida.' }, { status: 400 });
}
