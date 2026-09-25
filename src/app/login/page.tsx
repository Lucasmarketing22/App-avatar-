'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? 'No se pudo entrar.');
        setLoading(false);
        return;
      }
      router.replace('/');
      router.refresh();
    } catch {
      setError('No se pudo conectar. Probá de nuevo.');
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <form
        onSubmit={submit}
        style={{
          width: '100%',
          maxWidth: 360,
          background: '#fff',
          border: '1px solid #e2ddd5',
          borderRadius: 18,
          padding: 28,
        }}
      >
        <div
          style={{
            fontFamily: "'Bricolage Grotesque', sans-serif",
            fontWeight: 800,
            fontSize: 26,
            letterSpacing: '-0.02em',
            marginBottom: 6,
          }}
        >
          musa<span style={{ color: '#4f35e8' }}>.studio</span>
        </div>
        <p style={{ marginTop: 0, color: '#55525c', fontSize: 14 }}>
          Ingresá la contraseña para entrar.
        </p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Contraseña"
          autoFocus
          style={{
            width: '100%',
            boxSizing: 'border-box',
            height: 44,
            borderRadius: 10,
            border: '1px solid #d6d0c6',
            padding: '0 12px',
            fontSize: 15,
            fontFamily: 'inherit',
          }}
        />
        {error ? (
          <p style={{ color: '#c0322b', fontSize: 13, marginBottom: 0 }}>{error}</p>
        ) : null}
        <button
          type="submit"
          disabled={loading}
          style={{
            marginTop: 14,
            width: '100%',
            height: 46,
            borderRadius: 12,
            border: 'none',
            background: loading ? '#8a7fd8' : '#4f35e8',
            color: '#fff',
            fontSize: 15,
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {loading ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  );
}
