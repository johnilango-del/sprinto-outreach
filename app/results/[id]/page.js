import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db, dbError } from '@/lib/supabase';
import { activeSender, env } from '@/lib/config';
import StatusTag from '../../components/StatusTag';
import { SectionTitle, Icon } from '../../components/Icons';
import EmailPanel from '../../components/EmailPanel';
import AgreeButtons from '../../components/AgreeButtons';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Why card · Outreach Desk' };

const FIELD_NAMES = {
  certified: 'Certified (SOC 2 / ISO 27001)',
  b2b_saas: 'B2B SaaS',
  handles_data: 'Handles customer data',
  stage: 'Stage',
};

function pathOf(url) {
  try {
    const u = new URL(url);
    return u.host.replace(/^www\./, '') + (u.pathname === '/' ? '' : u.pathname);
  } catch {
    return url;
  }
}

function Source({ url }) {
  if (!url) return null;
  return (
    <a className="readnow" href={url} target="_blank" rel="noopener noreferrer">
      {pathOf(url)} →
    </a>
  );
}

function Quote({ text }) {
  if (!text) return null;
  return <blockquote className="q">“{text}”</blockquote>;
}

export default async function WhyCard({ params }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  let run = null;
  let contact = null;
  let loadError = null;
  try {
    const { data, error } = await db().from('runs').select('*').eq('id', id).maybeSingle();
    if (error) loadError = dbError(error, 'Could not load this company');
    run = data;
    // The chosen person is stored on the run, whichever source they came from.
    if (run?.contact_name) {
      contact = {
        source: run.contact_source,
        person_name: run.contact_name,
        title: run.contact_title,
        email: run.contact_email,
        confidence: run.contact_confidence,
        pick_reason: run.pick_reason,
      };
    } else if (run?.contact_id) {
      const { data: c } = await db().from('contacts').select('*').eq('id', run.contact_id).maybeSingle();
      if (c) contact = { ...c, source: 'apollo_list', pick_reason: `From your Apollo list: ${c.why_chosen || 'no reason noted'}` };
    }
  } catch (e) {
    loadError = e.message;
  }
  if (!loadError && !run) notFound();

  if (loadError) {
    return (
      <section className="wrap" style={{ padding: '40px 16px' }}>
        <div className="notice error">{loadError}</div>
      </section>
    );
  }

  const fields = run.fields || {};
  const signals = Array.isArray(fields.pressure_signals) ? fields.pressure_signals : [];
  const disqualifiers = Array.isArray(fields.disqualifiers) ? fields.disqualifiers : [];
  const flags = Array.isArray(run.flags) ? run.flags : [];
  const pages = Array.isArray(run.pages_fetched) ? run.pages_fetched : [];
  const pains = Array.isArray(run.pain_points) ? run.pain_points : [];
  const cc = run.contact_check || null;
  const facts = Array.isArray(run.facts_used) ? run.facts_used : [];
  const isFit = run.status === 'GOOD_FIT' || run.status === 'GOOD_FIT_FLAGGED';
  const stepLog = Array.isArray(run.step_log) ? run.step_log : [];

  return (
    <>
      <section className="plum-bg band">
        <div className="wrap">
          <Link href="/results" className="eyebrow" style={{ textDecoration: 'none' }}>
            ← All results
          </Link>
          <h1>{run.company_name || run.domain}</h1>
          <p>
            <a href={`https://${run.domain}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--lime)' }}>
              {run.domain}
            </a>{' '}
            · run {new Date(run.created_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} UTC ·{' '}
            {run.seconds_taken != null ? `${Number(run.seconds_taken).toFixed(1)}s` : ''}
          </p>
        </div>
      </section>

      <section className="wrap band-overlap">
        <div className="why-grid">
          {/* (a) decision */}
          <div className="card">
            <SectionTitle icon="decision" label="Why this company: the decision" />
            <div className="decision">
              <StatusTag status={run.status} />
              <span className="muted small">
                {run.pressure_points ?? 0} pressure point{run.pressure_points === 1 ? '' : 's'} · {flags.length} flag{flags.length === 1 ? '' : 's'} · {pages.length} page fetch{pages.length === 1 ? '' : 'es'}
              </span>
            </div>
            <p className="big-reason">{run.status_reason}</p>
            <div style={{ marginTop: 18 }}>
              <div className="small muted" style={{ marginBottom: 8 }}>Do you agree with this fit decision?</div>
              <AgreeButtons id={run.id} initial={run.fit_agreement} />
            </div>
          </div>

          {/* (e) flags */}
          {flags.length > 0 && (
            <div className="card">
              <SectionTitle icon="flag" label={`Flags (${flags.length})`} />
              {flags.map((f, i) => (
                <div key={i} className={`flag ${/claim not found/.test(f) ? 'strong' : ''}`}>
                  {f}
                </div>
              ))}
            </div>
          )}

          <div className="why-grid two">
            {/* (b) facts */}
            <div className="card">
              <SectionTitle icon="facts" label="Fact fields, with quotes" />
              {Object.keys(FIELD_NAMES).map((k) => {
                const f = fields[k] || {};
                return (
                  <div className="fact" key={k}>
                    <div className="fact-name">{FIELD_NAMES[k]}</div>
                    {f.value ? (
                      <>
                        <div className="fact-value">{f.value}</div>
                        <Quote text={f.quote} />
                        <Source url={f.source_url} />
                      </>
                    ) : (
                      <div className="fact-empty">Empty: not found on the pages checked</div>
                    )}
                  </div>
                );
              })}
              {disqualifiers.length > 0 && (
                <div className="fact">
                  <div className="fact-name">Disqualifiers found</div>
                  {disqualifiers.map((d, i) => (
                    <div key={i} style={{ marginTop: 6 }}>
                      <div className="fact-value">
                        {d.rule.replace('_', ' ')}: {d.reason}
                      </div>
                      <Quote text={d.quote} />
                      <Source url={d.source_url} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* (c) pressure points */}
            <div className="card">
              <SectionTitle icon="gauge" label="Pressure points, added up" />
              <div className="points">
                <span className="n">{run.pressure_points ?? 0}</span>
                <span className="muted">points · strong = 2, medium = 1 · 2 or more qualifies, 1 is flagged, 0 is not a fit</span>
              </div>
              {signals.length === 0 && <div className="fact-empty">No pressure signals with a verified quote.</div>}
              {signals.map((s, i) => (
                <div className="sig-row" key={i}>
                  <div>
                    <div className="fact-value">{s.signal}</div>
                    <Quote text={s.quote} />
                    <Source url={s.source_url} />
                    {s.by === 'code' && <div className="small muted">Found by the code’s certification check (nearby-words rule).</div>}
                  </div>
                  <span className={`strength ${s.strength}`}>
                    {s.strength} +{s.strength === 'strong' ? 2 : 1}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* (d) pages */}
          <div className="card">
            <SectionTitle icon="pages" label="Pages fetched and what each answered (the agent loop)" />
            {pages.length === 0 && <div className="fact-empty">No pages were fetched.</div>}
            <ol className="pages-list">
              {pages.map((p, i) => (
                <li key={i}>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
                    <strong>{p.page}</strong>
                    <span className="pill">{p.kind}</span>
                    <span className="small muted">
                      {p.found_via}
                      {p.from_cache ? ' · from cache' : ''}
                      {p.http_status ? ` · HTTP ${p.http_status}` : ''}
                      {p.words != null ? ` · ${p.words} words` : ''}
                    </span>
                  </div>
                  <div className="small" style={{ marginTop: 4 }}>
                    {p.result === 'read' ? (
                      <>
                        <span className="muted">Answered: </span>
                        {(p.answered || []).join('; ') || 'nothing new'}
                      </>
                    ) : (
                      <span className="no">{p.result}</span>
                    )}
                  </div>
                  <Source url={p.url} />
                </li>
              ))}
            </ol>
            {stepLog.length > 0 && (
              <details style={{ marginTop: 14 }}>
                <summary className="small" style={{ cursor: 'pointer', color: 'var(--plum-link)', fontWeight: 600 }}>
                  Show the full step log
                </summary>
                <ul className="small" style={{ paddingLeft: 18, marginTop: 8 }}>
                  {stepLog.map((s, i) => (
                    <li key={i}>
                      <span className="muted">{s.t}s</span> · {s.step} · {s.state}
                      {s.note ? ` · ${s.note}` : ''}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>

          <div className="why-grid two">
            {/* (f) contact */}
            <div className="card">
              <SectionTitle icon="person" label="Contact and contact check" />
              {!contact ? (
                <div className="fact-empty">
                  {run.status === 'NO_CONTACT' ? (
                    <>
                      Neither Hunter nor your Apollo list had a suitable person. <Link href="/contacts">Add one on the Contacts page</Link>, then run it again.
                    </>
                  ) : isFit ? (
                    'No contact linked.'
                  ) : (
                    'Contacts are only looked up for good fits.'
                  )}
                </div>
              ) : (
                <>
                  <div style={{ marginBottom: 14 }}>
                    <span className={`source-tag ${contact.source === 'hunter' ? 'hunter' : 'apollo'}`}>
                      {contact.source === 'hunter' ? 'Found by Hunter' : 'From your Apollo list'}
                    </span>
                    {contact.pick_reason && <p className="small" style={{ margin: '8px 0 0' }}>{contact.pick_reason}</p>}
                  </div>
                <dl className="kv">
                  <dt>Name</dt>
                  <dd>{contact.person_name}</dd>
                  <dt>Title</dt>
                  <dd>{contact.title || <span className="muted">none given</span>}</dd>
                  <dt>Email</dt>
                  <dd>
                    {contact.email || <span className="muted">none given</span>}
                    {contact.confidence != null ? <span className="small muted"> · Hunter confidence {contact.confidence}%</span> : null}
                  </dd>
                  {cc && (
                    <>
                      <dt>Title fits?</dt>
                      <dd>
                        <span className={cc.title_fits === 'no' ? 'no' : 'yes'}>{cc.title_fits || 'not checked'}</span>
                        {cc.title_reason ? ` · ${cc.title_reason}` : ''}
                        <span className="small muted"> (checked by {cc.title_checked_by === 'code' ? 'code' : 'the AI'})</span>
                      </dd>
                      <dt>Domain matches?</dt>
                      <dd>
                        <span className={cc.domain_matches === 'no' ? 'no' : 'yes'}>{cc.domain_matches}</span>
                        {cc.email_domain ? ` · email is @${cc.email_domain}` : ''}
                        {cc.company_domains?.length ? `, company: ${cc.company_domains.join(', ')}` : ''}
                      </dd>
                      <dt>Matched by</dt>
                      <dd>{cc.matched_by}</dd>
                    </>
                  )}
                </dl>
                </>
              )}
            </div>

            {/* (g) pain points */}
            <div className="card">
              <SectionTitle icon="target" label="Two pain points, linked to quotes" />
              {pains.length === 0 && <div className="fact-empty">Pain points are only written for good fits with a contact.</div>}
              {pains.map((p, i) => (
                <div className="pain" key={i}>
                  <div className="fact-value">
                    {i + 1}. {p.pain}
                  </div>
                  {p.why && <div className="small muted">{p.why}</div>}
                  {p.verified ? (
                    <>
                      <Quote text={p.quote} />
                      <Source url={p.source_url} />
                    </>
                  ) : (
                    <div className="flag" style={{ marginTop: 8 }}>No verified quote for this pain point.</div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* (h) email */}
          <div className="card" id="email">
            <SectionTitle icon="mail" label="The email" />
            {run.email_original ? (
              <EmailPanel
                id={run.id}
                subject={run.email_subject}
                original={run.email_original}
                final={run.email_final}
                status={run.email_status}
                sentAt={run.sent_at}
                editPercent={run.edit_percent}
                usedSender={run.email_sender}
                facts={facts}
                contactName={contact?.person_name || ''}
                contactEmail={contact?.email || ''}
                recipient={env('EMAIL_TEST_RECIPIENT')}
                senderLabel={activeSender().label}
                senderReady={activeSender().kind !== 'none'}
              />
            ) : (
              <div className="fact-empty">
                No email drafted.{' '}
                {isFit || run.status === 'NO_CONTACT' ? 'See the flags above for why.' : 'Emails are only drafted for good fits with a contact.'}
              </div>
            )}
          </div>
        </div>
        <div style={{ marginTop: 24 }}>
          <Link href="/results" className="btn btn-secondary">
            <Icon name="arrow" /> Back to results
          </Link>
        </div>
      </section>
    </>
  );
}
