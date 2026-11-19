'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from './Icons';

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Shows the email text with every unverified claim highlighted.
function Highlighted({ text, claims }) {
  const parts = useMemo(() => {
    const needles = claims.map((c) => c.trim()).filter((c) => c.length >= 4);
    if (!needles.length) return [{ t: text, hit: false }];
    const re = new RegExp(`(${needles.map((n) => escapeRe(n).replace(/\s+/g, '\\s+')).join('|')})`, 'gi');
    return text.split(re).map((t, i) => ({ t, hit: i % 2 === 1 }));
  }, [text, claims]);
  return (
    <div className="email-preview">
      {parts.map((p, i) => (p.hit ? <mark className="claim" key={i}>{p.t}</mark> : <span key={i}>{p.t}</span>))}
    </div>
  );
}

export default function EmailPanel(props) {
  const router = useRouter();
  const { id, subject, original, final, sentAt, editPercent, usedSender, facts, contactName, contactEmail, recipient, senderLabel, senderReady } = props;
  const [status, setStatus] = useState(props.status || 'draft');
  const [text, setText] = useState(final || original || '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [sentInfo, setSentInfo] = useState(status === 'sent' ? { sent_at: sentAt, edit_percent: editPercent, sender: usedSender } : null);

  const locked = status === 'sent' || status === 'sending';
  const unverified = (facts || []).filter((f) => !f.verified).map((f) => f.quote);
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  async function send() {
    if (locked || busy) return;
    if (!window.confirm(`Send this email to ${recipient || 'your test inbox'}? It can only be sent once.`)) return;
    setBusy(true);
    setError('');
    setMsg('');
    try {
      const res = await fetch(`/api/runs/${id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email_final: text }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `Error ${res.status}`);
      setStatus('sent');
      setSentInfo({ sent_at: j.sent_at, edit_percent: j.edit_percent, sender: j.sender });
      setMsg(`Sent to ${j.to} via ${j.sender === 'gmail' ? 'Gmail' : 'Resend'}.`);
      router.refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function setSkip(action) {
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
      setStatus(action === 'skip' ? 'skipped' : 'draft');
      router.refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="to-line">
        Test mode: goes to <strong>{recipient || 'EMAIL_TEST_RECIPIENT (not set)'}</strong>, never to the prospect. Sender: {senderLabel}.
      </div>
      <label className="small muted" htmlFor={`subj-${id}`}>Subject line as it will arrive</label>
      <div className="email-subject" id={`subj-${id}`} style={{ marginTop: 4, marginBottom: 14 }}>
        [To: {contactName || 'unknown'} &lt;{contactEmail || 'no email'}&gt;] {subject}
      </div>

      {unverified.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div className="flag strong">
            The email relies on {unverified.length === 1 ? 'a claim' : `${unverified.length} claims`} not found on the site. Highlighted below: check or remove before sending.
          </div>
          {unverified.map((c, i) => (
            <div className="flag" key={i}>
              Not found on site: “{c}”
            </div>
          ))}
          <div style={{ marginTop: 10 }}>
            <Highlighted text={text} claims={unverified} />
          </div>
        </div>
      )}

      <label className="small muted" htmlFor={`body-${id}`}>
        Email body {locked ? '(sent, locked)' : '(you can edit before sending)'} · {words} words
      </label>
      <textarea
        id={`body-${id}`}
        className="email-box"
        value={text}
        onChange={(e) => setText(e.target.value)}
        readOnly={locked}
        style={{ marginTop: 4 }}
      />

      {facts?.length > 0 && (
        <details style={{ marginTop: 10 }}>
          <summary className="small" style={{ cursor: 'pointer', color: 'var(--plum-link)', fontWeight: 600 }}>
            Facts the email relies on ({facts.length})
          </summary>
          <ul className="small" style={{ paddingLeft: 18 }}>
            {facts.map((f, i) => (
              <li key={i}>
                <span className={f.verified ? 'yes' : 'no'}>{f.verified ? 'verified' : 'NOT FOUND'}</span> · “{f.quote}”
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="btn-row">
        <button className="btn btn-primary btn-big" onClick={send} disabled={locked || busy || !senderReady || !text.trim()}>
          <Icon name="mail" /> {status === 'sent' ? 'Sent' : busy ? 'Sending…' : 'Send to my inbox'}
        </button>
        {status === 'draft' && (
          <button className="btn btn-secondary" onClick={() => setSkip('skip')} disabled={busy}>
            Skip
          </button>
        )}
        {status === 'skipped' && (
          <>
            <span className="pill skipped">Skipped</span>
            <button className="btn btn-secondary btn-small" onClick={() => setSkip('unskip')} disabled={busy}>
              Undo skip
            </button>
          </>
        )}
        {!senderReady && <span className="small no">No sender set up: add Gmail or Resend settings in Vercel.</span>}
      </div>

      {sentInfo && (
        <div className="small" style={{ marginTop: 12 }}>
          <span className="pill sent">Sent</span>{' '}
          {sentInfo.sent_at ? new Date(sentInfo.sent_at).toLocaleString('en-GB', { timeZone: 'UTC' }) + ' UTC' : ''} · via{' '}
          {sentInfo.sender === 'gmail' ? 'Gmail' : sentInfo.sender === 'resend' ? 'Resend' : sentInfo.sender} · edited{' '}
          {sentInfo.edit_percent ?? 0}% of the original
        </div>
      )}
      {msg && <div className="small yes" style={{ marginTop: 8 }}>{msg}</div>}
      {error && <div className="notice error" style={{ marginTop: 12 }}>{error}</div>}
    </div>
  );
}
