'use client';

import { useEffect, useRef, useState } from 'react';

type Phase = 'idle' | 'uploading' | 'creating' | 'polling' | 'done' | 'error';

const ASPECTS = ['3:4', '1:1', '4:5', '9:16', '16:9', '4:3'];

export default function Home() {
  const [prompt, setPrompt] = useState('');
  const [aspect, setAspect] = useState('3:4');
  const [refUrl, setRefUrl] = useState<string | null>(null);
  const [refPreview, setRefPreview] = useState<string | null>(null);

  const [phase, setPhase] = useState<Phase>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [error, setError] = useState('');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [stored, setStored] = useState<boolean | null>(null);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const busy = phase === 'uploading' || phase === 'creating' || phase === 'polling';

  async function onPickReference(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setPhase('uploading');
    setStatusMsg('Subiendo la foto de referencia…');
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? 'No se pudo subir la imagen.');
        setPhase('error');
        return;
      }
      setRefUrl(data.url);
      setRefPreview(URL.createObjectURL(file));
      setPhase('idle');
      setStatusMsg('');
    } catch {
      setError('No se pudo subir la imagen.');
      setPhase('error');
    }
  }

  function clearReference() {
    setRefUrl(null);
    setRefPreview(null);
  }

  async function generate() {
    if (busy) return;
    if (!prompt.trim()) {
      setError('Escribí una frase para generar.');
      return;
    }
    setError('');
    setResultUrl(null);
    setCredits(null);
    setStored(null);
    setPhase('creating');
    setStatusMsg('Enviando el pedido a la IA…');

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), imageUrl: refUrl, aspect }),
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
          setCredits(typeof data.credits === 'number' ? data.credits : null);
          setStored(Boolean(data.stored));
          setPhase('done');
          setStatusMsg('');
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
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '32px 20px 64px' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <div
          style={{
            fontFamily: "'Bricolage Grotesque', sans-serif",
            fontWeight: 800,
            fontSize: 26,
            letterSpacing: '-0.02em',
          }}
        >
          musa<span style={{ color: '#4f35e8' }}>.studio</span>
        </div>
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: '#3a22c4',
            background: '#eeeafe',
            padding: '4px 10px',
            borderRadius: 999,
          }}
        >
          Etapa 1 · prueba del motor
        </span>
        <div style={{ flexGrow: 1 }} />
        <button
          type="button"
          onClick={() => fetch('/api/logout', { method: 'POST' }).then(() => location.reload())}
          style={{
            border: '1px solid #d6d0c6',
            background: '#fff',
            borderRadius: 10,
            padding: '6px 12px',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Salir
        </button>
      </header>
      <p style={{ color: '#55525c', marginTop: 0, fontSize: 14 }}>
        Escribí una frase y generá una imagen con IA (Kie.ai). Opcional: sumá una
        foto de referencia. El resultado se guarda en tu almacenamiento.
      </p>

      <div
        style={{
          display: 'grid',
          gap: 20,
          gridTemplateColumns: '1fr',
          marginTop: 8,
        }}
      >
        {/* Controles */}
        <section
          style={{
            background: '#fbfaf7',
            border: '1px solid #e2ddd5',
            borderRadius: 16,
            padding: 18,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <label style={{ fontSize: 13, fontWeight: 700 }}>
            Descripción (frase)
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ej: a young woman smiling in a cozy cafe, natural light, iPhone photo"
              style={{
                display: 'block',
                width: '100%',
                boxSizing: 'border-box',
                height: 88,
                marginTop: 6,
                borderRadius: 10,
                border: '1px solid #d6d0c6',
                padding: 10,
                fontSize: 14,
                fontFamily: 'inherit',
                resize: 'vertical',
              }}
            />
          </label>

          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ fontSize: 13, fontWeight: 700 }}>
              Formato
              <select
                value={aspect}
                onChange={(e) => setAspect(e.target.value)}
                style={{
                  display: 'block',
                  marginTop: 6,
                  height: 40,
                  borderRadius: 10,
                  border: '1px solid #d6d0c6',
                  padding: '0 10px',
                  fontSize: 14,
                  fontFamily: 'inherit',
                  background: '#fff',
                }}
              >
                {ASPECTS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>

            <div style={{ fontSize: 13, fontWeight: 700 }}>
              Foto de referencia (opcional)
              <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
                {refPreview ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={refPreview}
                      alt="referencia"
                      style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8 }}
                    />
                    <button
                      type="button"
                      onClick={clearReference}
                      style={{
                        border: '1px solid #d6d0c6',
                        background: '#fff',
                        borderRadius: 8,
                        padding: '6px 10px',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      Quitar
                    </button>
                  </>
                ) : (
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={onPickReference}
                    style={{ fontSize: 13 }}
                  />
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={generate}
            disabled={busy}
            style={{
              height: 48,
              borderRadius: 12,
              border: 'none',
              background: busy ? '#8a7fd8' : '#4f35e8',
              color: '#fff',
              fontSize: 15,
              fontWeight: 700,
              cursor: busy ? 'default' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {busy ? 'Trabajando…' : 'Generar imagen'}
          </button>

          {statusMsg ? (
            <p style={{ margin: 0, fontSize: 13, color: '#3a22c4' }}>{statusMsg}</p>
          ) : null}
          {error ? (
            <p
              style={{
                margin: 0,
                fontSize: 13,
                color: '#c0322b',
                background: '#fbeceb',
                border: '1px solid #f3cfcb',
                borderRadius: 10,
                padding: '8px 10px',
              }}
            >
              {error}
            </p>
          ) : null}
        </section>

        {/* Resultado */}
        <section
          style={{
            background: '#fff',
            border: '1px solid #e2ddd5',
            borderRadius: 16,
            padding: 18,
            minHeight: 220,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: '#6b6772' }}>Resultado</div>
          {phase === 'polling' || phase === 'creating' ? (
            <div style={{ color: '#55525c', fontSize: 14 }}>Generando…</div>
          ) : null}
          {resultUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resultUrl}
                alt="resultado"
                style={{ width: '100%', maxWidth: 380, borderRadius: 12, alignSelf: 'center' }}
              />
              <div style={{ fontSize: 13, color: '#1e6b45', fontWeight: 600 }}>
                ✓ Imagen generada{stored ? ' y guardada en tu almacenamiento' : ''}
                {credits != null ? ` · ${credits} créditos` : ''}
              </div>
              <a href={resultUrl} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>
                Abrir imagen en pestaña nueva
              </a>
            </>
          ) : phase !== 'polling' && phase !== 'creating' ? (
            <div style={{ color: '#8a8790', fontSize: 14 }}>
              Todavía no generaste nada. Escribí una frase y tocá “Generar imagen”.
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
