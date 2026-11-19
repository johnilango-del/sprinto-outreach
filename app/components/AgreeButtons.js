'use client';

import { useState } from 'react';

export default function AgreeButtons({ id, initial }) {
  const [value, setValue] = useState(initial || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function choose(action) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/runs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `Error ${res.status}`);
      setValue(action);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="btn-row" style={{ marginTop: 0 }}>
      <button className={`btn btn-secondary btn-small ${value === 'agree' ? 'selected' : ''}`} disabled={busy} onClick={() => choose('agree')} aria-pressed={value === 'agree'}>
        Agree with this decision
      </button>
      <button className={`btn btn-secondary btn-small ${value === 'disagree' ? 'selected' : ''}`} disabled={busy} onClick={() => choose('disagree')} aria-pressed={value === 'disagree'}>
        Disagree
      </button>
      {value && <span className="small muted">Saved: you {value === 'agree' ? 'agree' : 'disagree'}.</span>}
      {error && <span className="small no">{error}</span>}
    </div>
  );
}
