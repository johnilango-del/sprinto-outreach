'use client';

import { useRef, useState } from 'react';
import { DEFAULT_FILTERS, INDUSTRY_OPTIONS, HEADCOUNT_OPTIONS, REGION_OPTIONS } from '@/lib/discoverOptions';
import Link from 'next/link';
import { Icon } from './Icons';
import StatusTag from './StatusTag';
import RunSummary, { ActionBox } from './RunSummary';

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
        <div className="track-domain">
          {item.website}{' '}
          {!item.result && (
            <span className={`origin-tag origin-${item.source}`}>{item.source === 'discovered' ? 'Found by Discover' : 'Pasted'}</span>
          )}
        </div>
        {item.result ? <StatusTag status={item.result.status} /> : item.phase === 'queued' ? <span className="pill">Waiting</span> : null}
      </div>
      <div className="track-now" aria-live="polite">
        {item.phase === 'queued' ? 'waiting for its turn' : item.now}
      </div>
      <div className="steps" role="list" aria-label={`Progress for ${item.website}`}>
        {STEPS.map((s) => (
          <div className="stepc" key={s.key} role="listitem" aria-label={`${s.label}: ${STATE_WORDS[item.steps[s.key]] || 'not started'}`}>
            <StepCircle state={item.steps[s.key]} />
            <span className="lbl">{s.key === 'contact' && item.contactSource ? `Contact: ${item.contactSource}` : s.label}</span>
          </div>
        ))}
      </div>
      {item.result && (
        <div>
          {item.result.present ? <RunSummary p={item.result.present} hideTag /> : <p className="small">{item.result.status_reason}</p>}
          <div className="track-result">
          {item.result.id && (
            <Link className="readnow" href={`/results/${item.result.id}`}>
              Open the Why card →
            </Link>
          )}
          <span className="muted small">{item.result.seconds}s</span>
          </div>
        </div>
      )}
      {item.error && <div className="notice error" style={{ marginTop: 12 }}>{item.error}</div>}
    </div>
  );
}

function CheckGroup({ legend, options, values, onChange, disabled }) {
  return (
    <fieldset className="check-group" disabled={disabled}>
      <legend>{legend}</legend>
      <div className="check-row">
        {options.map((o) => (
          <label key={o.value} className={`check-pill ${values.includes(o.value) ? 'on' : ''}`}>
            <input
              type="checkbox"
              checked={values.includes(o.value)}
              onChange={(e) => onChange(e.target.checked ? [...values, o.value] : values.filter((v) => v !== o.value))}
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default function RunClient() {
  const [text, setText] = useState('');
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const stopRef = useRef(false);
  const progressRef = useRef(null);

  // discovery state
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [includeResearched, setIncludeResearched] = useState(false);
  const [finding, setFinding] = useState(false);
  const [found, setFound] = useState(null); // { companies, ... }
  const [picked, setPicked] = useState([]);
  const [findError, setFindError] = useState('');
  const setF = (k) => (v) => setFilters((f) => ({ ...f, [k]: v }));

  const update = (index, fn) => setItems((prev) => prev.map((it, i) => (i === index ? fn(it) : it)));

  async function runOne(index, website, source) {
    update(index, (it) => ({ ...it, phase: 'running', now: 'reading site', trail: ['reading site'] }));
    let finished = false;
    try {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ website, source }),
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
              const contactSource = ev.step === 'contact' && ev.source ? ev.source : it.contactSource;
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
              return { ...it, steps, contactSource, now: trail.join(' → '), trail };
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

  // Sends domains into the existing research flow, one company at a time, never all at once.
  async function runList(list, source) {
    if (!list.length || busy) return;
    stopRef.current = false;
    setBusy(true);
    setItems(list.map((website) => ({ website, source, phase: 'queued', steps: {}, now: '', trail: [] })));
    setTimeout(() => progressRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    for (let i = 0; i < list.length; i++) {
      if (stopRef.current) break;
      await runOne(i, list[i], source);
    }
    setBusy(false);
  }

  function startPasted(e) {
    e.preventDefault();
    runList(parseList(text), 'pasted');
  }

  async function findProspects(e) {
    e.preventDefault();
    setFinding(true);
    setFindError('');
    setFound(null);
    try {
      const res = await fetch('/api/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters, includeResearched }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error || `The server answered ${res.status}.`);
      setFound(j);
      setPicked(j.companies.map((c) => c.domain));
    } catch (err) {
      setFindError(err.message || String(err));
    } finally {
      setFinding(false);
    }
  }

  const count = parseList(text).length;
  const doneCount = items.filter((i) => i.phase === 'done' || i.phase === 'error').length;
  const companies = found?.companies || [];
  const statusNote = busy ? `Working on ${Math.min(doneCount + 1, items.length)} of ${items.length}…` : '';

  return (
    <>
      <section className="plum-bg hero" id="find">
        <div className="wrap">
          <div className="eyebrow">Prospect discovery · fit-rules.txt</div>
          <h1>
            Find the companies. Research the fit. <span className="hl">You decide</span> the send.
          </h1>
          <p className="sub">
            Hunter suggests companies that look like Sprinto’s ideal customer; the system then reads each site, checks it against
            the fit rules, finds the right person and drafts an email. Nothing is sent until you click.
          </p>

          <form className="paste-card find-card" onSubmit={findProspects}>
            <h2 className="card-h">Find prospects for Sprinto</h2>
            <p className="small muted" style={{ margin: '4px 0 16px' }}>
              Pre-filled from Sprinto’s ideal customer: B2B software, 11-500 people, based in the US, UK or Europe. Agencies, IT
              consultancies, public companies, schools, government and non-profits are always left out.
            </p>
            <div className="form-grid">
              <div className="field wide">
                <label htmlFor="q">Describe the companies (plain words)</label>
                <input id="q" value={filters.query} onChange={(e) => setF('query')(e.target.value)} disabled={finding || busy} />
              </div>
              <div className="field wide">
                <label htmlFor="kw">Keywords (comma separated, any can match)</label>
                <input id="kw" value={filters.keywords} onChange={(e) => setF('keywords')(e.target.value)} disabled={finding || busy} />
              </div>
            </div>
            <CheckGroup legend="Industry" options={INDUSTRY_OPTIONS} values={filters.industries} onChange={setF('industries')} disabled={finding || busy} />
            <CheckGroup legend="Headcount" options={HEADCOUNT_OPTIONS} values={filters.headcount} onChange={setF('headcount')} disabled={finding || busy} />
            <CheckGroup legend="Headquarters" options={REGION_OPTIONS} values={filters.regions} onChange={setF('regions')} disabled={finding || busy} />
            <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 14 }}>
              <input type="checkbox" checked={includeResearched} onChange={(e) => setIncludeResearched(e.target.checked)} disabled={finding || busy} />
              Include companies already researched in the last 30 days
            </label>
            <div className="run-row" style={{ marginTop: 18 }}>
              <button className="btn btn-primary btn-big" type="submit" disabled={finding || busy}>
                <Icon name="target" /> {finding ? 'Searching Hunter…' : 'Find prospects'}
              </button>
              <span className="small muted credit-note">
                Free: Hunter’s API documentation says a Discover search “is free” and uses no credits (your Hunter plan must
                include Discover). Researching a company later uses the usual Hunter contact-search credits.
              </span>
            </div>
          </form>
        </div>
      </section>

      <section className="wrap" style={{ paddingBottom: 56 }}>
        {findError && (
          <div style={{ marginTop: 28 }}>
            <ActionBox items={[findError]} />
          </div>
        )}

        {found && (
          <div className="card" style={{ marginTop: 28 }} id="prospects">
            <div className="eyebrow">Prospects found</div>
            <h2 style={{ fontSize: 26, margin: '6px 0 4px' }}>
              {companies.length} compan{companies.length === 1 ? 'y' : 'ies'} to research
            </h2>
            <p className="small muted" style={{ margin: 0 }}>
              {found.total_matching ? `${found.total_matching.toLocaleString('en-GB')} companies match these filters on Hunter. ` : ''}
              {found.skipped_researched ? `${found.skipped_researched} already researched in the last 30 days were left out. ` : ''}
              {found.from_cache ? 'Saved search reused. ' : ''}
              Hunter’s Discover results list only the company name, domain and number of known emails, so industry, size and location
              below are the filters they matched, not checked facts.
            </p>
            <div className="note-box">Discovery only suggests companies. The fit check decides who qualifies.</div>

            {companies.length === 0 ? (
              <div className="empty">No new companies matched. Try more industries, fewer keywords, or tick “include companies already researched”.</div>
            ) : (
              <>
                <div className="select-row">
                  <button type="button" className="linklike" onClick={() => setPicked(companies.map((c) => c.domain))}>
                    Select all
                  </button>
                  <span className="muted">/</span>
                  <button type="button" className="linklike" onClick={() => setPicked([])}>
                    none
                  </button>
                  <span className="small muted">
                    {picked.length} of {companies.length} ticked
                  </span>
                </div>
                <ul className="prospect-list">
                  {companies.map((c) => (
                    <li key={c.domain}>
                      <label>
                        <input
                          type="checkbox"
                          checked={picked.includes(c.domain)}
                          onChange={(e) => setPicked((p) => (e.target.checked ? [...p, c.domain] : p.filter((d) => d !== c.domain)))}
                          disabled={busy}
                        />
                        <span className="p-main">
                          <strong>{c.name}</strong>
                          <a href={`https://${c.domain}`} target="_blank" rel="noopener noreferrer" className="readnow" onClick={(e) => e.stopPropagation()}>
                            {c.domain} →
                          </a>
                        </span>
                        <span className="p-meta small muted">
                          {c.industry || `matched: ${found.summary.industries.join(', ') || 'any industry'}`} ·{' '}
                          {c.headcount || `${found.summary.headcount.join(', ') || 'any size'} staff`} ·{' '}
                          {c.location || REGION_OPTIONS.filter((o) => found.summary.regions.includes(o.value)).map((o) => o.label).join(' / ') || 'any region'}
                          {c.emails ? ` · ${c.emails} emails known to Hunter` : ''}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                <div className="run-row">
                  <button type="button" className="btn btn-primary btn-big" disabled={busy || picked.length === 0} onClick={() => runList(companies.filter((c) => picked.includes(c.domain)).map((c) => c.domain), 'discovered')}>
                    <Icon name="play" /> Research these ({picked.length})
                  </button>
                  <span className="small muted">{statusNote || 'They run one at a time, about a minute each at most.'}</span>
                </div>
              </>
            )}
          </div>
        )}

        <form className="card paste-secondary" onSubmit={startPasted} id="run">
          <div className="eyebrow">Already have a list?</div>
          <h2 style={{ fontSize: 22, margin: '6px 0 10px' }}>Paste websites</h2>
          <label htmlFor="sites" className="small muted">Company websites, one per line</label>
          <textarea
            id="sites"
            className="paste-box"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'logpulse.io\ngateco.ai\nsequenzy.com'}
            spellCheck={false}
            disabled={busy}
          />
          <div className="run-row" style={{ marginTop: 12 }}>
            <button className="btn btn-secondary" type="submit" disabled={busy || count === 0}>
              <Icon name="play" /> {busy ? 'Running…' : 'Run'}
            </button>
            {busy && (
              <button type="button" className="btn btn-secondary" onClick={() => (stopRef.current = true)}>
                Stop after this one
              </button>
            )}
            <span className="small muted">
              {statusNote || (count ? `${count} compan${count === 1 ? 'y' : 'ies'} ready. They run one at a time.` : 'Companies run one at a time.')}
            </span>
          </div>
        </form>

        <div ref={progressRef} style={{ scrollMarginTop: 16 }}>
          {items.length > 0 && (
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
          )}
        </div>
      </section>
    </>
  );
}
