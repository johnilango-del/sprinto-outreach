'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { Icon } from './Icons';
import StatusTag from './StatusTag';

const STEPS = [
  { key: 'site', label: 'Site' },
  { key: 'cert', label: 'Certification' },
  { key: 'facts', label: 'Facts' },
  { key: 'extra', label: 'Extra pages' },
  { key: 'status', label: 'Status' },
  { key: 'contact', label: 'Contact' },
  { key: 'email', label: 'Email' },
];

const RUNNING_TEXT = {
  site: 'reading site',
  cert: 'checking certification',
  facts: 'extracting facts',
  extra: 'fetching extra pages',
  status: 'setting status',
  contact: 'matching contact',
  email: 'writing email',
};

function parseList(text) {
  const seen = new Set();
  const out = [];
  for (const line of String(text).split(/[\n,]+/)) {
    const t = line.trim();
    if (!t) continue;
    const key = t.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function StepCircle({ state }) {
  let inner = null;
  if (state === 'done') inner = <Icon name="check" />;
  else if (state === 'flag') inner = '!';
  else if (state === 'skip') inner = '–';
  else if (state === 'error') inner = '×';
  return <span className={`circle ${state || ''}`}>{inner}</span>;
}

const STATE_WORDS = { done: 'done', flag: 'flagged', skip: 'skipped', error: 'failed', running: 'running' };

function Track({ item }) {
  return (
    <div className="track">
      <div className="track-head">
        <div className="track-domain">{item.website}</div>
        {item.result ? <StatusTag status={item.result.status} /> : item.phase === 'queued' ? <span className="pill">Waiting</span> : null}
      </div>
      <div className="track-now" aria-live="polite">
        {item.phase === 'queued' ? 'waiting for its turn' : item.now}
      </div>
      <div className="steps" role="list" aria-label={`Progress for ${item.website}`}>
        {STEPS.map((s) => (
          <div className="stepc" key={s.key} role="listitem" aria-label={`${s.label}: ${STATE_WORDS[item.steps[s.key]] || 'not started'}`}>
            <StepCircle state={item.steps[s.key]} />
            <span className="lbl">{s.label}</span>
          </div>
        ))}
      </div>
      {item.result && (
        <div className="track-result">
          <span>{item.result.status_reason}</span>
          {item.result.id && (
            <Link className="readnow" href={`/results/${item.result.id}`}>
              Open the Why card →
            </Link>
          )}
          <span className="muted small">{item.result.seconds}s</span>
        </div>
      )}
      {item.error && <div className="notice error" style={{ marginTop: 12 }}>{item.error}</div>}
    </div>
  );
}

export default function RunClient() {
  const [text, setText] = useState('');
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const stopRef = useRef(false);

  const update = (index, fn) => setItems((prev) => prev.map((it, i) => (i === index ? fn(it) : it)));

  async function runOne(index, website) {
    update(index, (it) => ({ ...it, phase: 'running', now: 'reading site', trail: ['reading site'] }));
    let finished = false;
    try {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ website }),
      });
      if (!res.ok || !res.body) {
        let msg = `The server answered ${res.status}.`;
        try {
          const j = await res.json();
          if (j?.error) msg = j.error;
        } catch {}
        if (res.status === 504) msg = 'The server hit its 60-second limit for this company. Try it again: pages are cached now.';
        throw new Error(msg);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let ev;
          try {
            ev = JSON.parse(line);
          } catch {
            continue;
          }
          if (ev.type === 'step') {
            update(index, (it) => {
              const steps = { ...it.steps, [ev.step]: ev.state };
              let now = it.now;
              let trail = it.trail;
              if (ev.state === 'running') {
                now = (ev.step === 'extra' || ev.step === 'contact') && ev.note ? ev.note : RUNNING_TEXT[ev.step] || ev.note;
                trail = [...it.trail, now].slice(-6);
              } else if (ev.state === 'error') {
                now = `failed: ${ev.note}`;
              } else if (ev.step === 'contact' && ev.note && (ev.state === 'done' || ev.state === 'flag')) {
                // show the contact result, e.g. "Found by Hunter: Jane Doe, CTO"
                trail = [...it.trail, ev.note].slice(-6);
              }
              return { ...it, steps, now: trail.join(' → '), trail };
            });
          } else if (ev.type === 'done') {
            finished = true;
            update(index, (it) => ({ ...it, phase: 'done', result: ev.run, now: [...it.trail, 'done'].slice(-6).join(' → ') }));
          } else if (ev.type === 'error') {
            finished = true;
            update(index, (it) => ({ ...it, phase: 'error', error: ev.message, now: 'stopped' }));
          }
        }
      }
      if (!finished) {
        throw new Error('The connection ended before this company finished (probably the 60-second limit). Run it again: fetched pages are cached.');
      }
    } catch (e) {
      update(index, (it) => ({ ...it, phase: 'error', error: e.message || String(e), now: 'stopped' }));
    }
  }

  async function start(e) {
    e.preventDefault();
    const list = parseList(text);
    if (!list.length || busy) return;
    stopRef.current = false;
    setBusy(true);
    setItems(list.map((website) => ({ website, phase: 'queued', steps: {}, now: '', trail: [] })));
    // One company at a time, never all at once.
    for (let i = 0; i < list.length; i++) {
      if (stopRef.current) break;
      await runOne(i, list[i]);
    }
    setBusy(false);
  }

  const count = parseList(text).length;
  const doneCount = items.filter((i) => i.phase === 'done' || i.phase === 'error').length;

  return (
    <>
      <section className="plum-bg hero" id="run">
        <div className="wrap">
          <div className="eyebrow">Outreach research · fit-rules.txt</div>
          <h1>
            Research the list. Draft the email. <span className="hl">You decide</span> the send.
          </h1>
          <p className="sub">
            Paste company websites, one per line. For each one the system reads the site, checks it against Sprinto’s fit
            rules, matches your Apollo contact and drafts a first email. Nothing is sent until you click.
          </p>
          <form onSubmit={start}>
            <div className="paste-card">
              <label htmlFor="sites">Company websites (one per line)</label>
              <textarea
                id="sites"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={'logpulse.io\ngateco.ai\nsequenzy.com'}
                spellCheck={false}
                disabled={busy}
              />
            </div>
            <div className="run-row">
              <button className="btn btn-on-plum btn-big" type="submit" disabled={busy || count === 0}>
                <Icon name="play" /> {busy ? 'Running…' : 'Run'}
              </button>
              {busy && (
                <button type="button" className="btn btn-secondary" onClick={() => (stopRef.current = true)}>
                  Stop after this one
                </button>
              )}
              <span className="note">
                {busy
                  ? `Working on ${Math.min(doneCount + 1, items.length)} of ${items.length}…`
                  : count
                    ? `${count} compan${count === 1 ? 'y' : 'ies'} ready. They run one at a time.`
                    : 'Companies run one at a time, about a minute each at most.'}
              </span>
            </div>
          </form>
        </div>
      </section>

      <section className="wrap" style={{ paddingBottom: 56 }}>
        {items.length > 0 ? (
          <>
            <div style={{ marginTop: 36, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div className="eyebrow">Live progress</div>
                <h2 style={{ fontSize: 28, marginTop: 6 }}>
                  {doneCount} of {items.length} done
                </h2>
              </div>
              {!busy && doneCount > 0 && (
                <Link href="/results" className="btn btn-primary">
                  See all results <Icon name="arrow" />
                </Link>
              )}
            </div>
            <div className="tracker-list">
              {items.map((item, i) => (
                <Track key={i} item={item} />
              ))}
            </div>
          </>
        ) : (
          <div style={{ marginTop: 36 }}>
            <div className="eyebrow">How it works</div>
            <div className="tiles" style={{ marginTop: 14 }}>
              {[
                ['Reads the site', 'Homepage first, then up to 4 more pages (careers, pricing, security, customers) only while a fact is missing.'],
                ['Code decides', 'The AI only fills facts, each with an exact quote. Code checks every quote and sets the status.'],
                ['The right person', 'Code picks from Hunter first (security lead, CTO, engineering head, founder), then your Apollo backup list. It never invents a contact.'],
                ['You send', 'Drafts wait for you. “Send to my inbox” sends one email, to your own inbox only.'],
              ].map(([t, d]) => (
                <div className="tile" key={t}>
                  <h3 style={{ fontSize: 20 }}>{t}</h3>
                  <div className="sub">{d}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </>
  );
}
