'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';

function LoginForm() {
  const params = useSearchParams();
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Could not sign in.');
      const next = params.get('next') || '/';
      window.location.href = next.startsWith('/') && !next.startsWith('//') ? next : '/';
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <form className="card login-card" onSubmit={submit}>
      <div className="eyebrow" style={{ marginBottom: 12 }}>Sign in</div>
      <div className="field">
        <label htmlFor="pw">Dashboard password</label>
        <input id="pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus required autoComplete="current-password" />
      </div>
      <div className="btn-row">
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Checking…' : 'Enter'}
        </button>
      </div>
      {error && <div className="notice error" style={{ marginTop: 12 }}>{error}</div>}
    </form>
  );
}

export default function LoginPage() {
  return (
    <>
      <section className="plum-bg band">
        <div className="wrap">
          <div className="eyebrow">Internal tool</div>
          <h1>Outreach Desk</h1>
        </div>
      </section>
      <section className="wrap band-overlap">
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </section>
    </>
  );
}
