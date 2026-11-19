import Link from 'next/link';
import { loadRuns, latestPerDomain } from '@/lib/runsData';
import { db } from '@/lib/supabase';
import { activeSender, env } from '@/lib/config';
import StatusTag from '../components/StatusTag';
import RunSummary from '../components/RunSummary';
import { presentRun, SOURCE_TAGS } from '@/lib/presentation';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Results · Outreach Desk' };

export default async function ResultsPage() {
  const { runs, error } = await loadRuns(
    'id, created_at, domain, company_name, status, status_reason, fields, pressure_points, flags, contact_id, contact_name, contact_title, contact_source, contact_attempts, pick_reason, seconds_taken, email_status, email_original'
  );
  const rows = latestPerDomain(runs);

  let contacts = {};
  const ids = [...new Set(rows.map((r) => r.contact_id).filter(Boolean))];
  if (ids.length) {
    try {
      const { data } = await db().from('contacts').select('id, person_name').in('id', ids);
      for (const c of data || []) contacts[c.id] = c.person_name;
    } catch {}
  }

  const sender = activeSender();
  const recipient = env('EMAIL_TEST_RECIPIENT');

  return (
    <>
      <section className="plum-bg band">
        <div className="wrap">
          <div className="eyebrow">Results</div>
          <h1>Every company, one decision each</h1>
          <p>Latest run per company. Click a row to open its Why card: the facts, quotes, pages checked and the draft email.</p>
        </div>
      </section>
      <section className="wrap band-overlap">
        <div className="card">
          <div className="sender-line" style={{ marginBottom: 18 }}>
            <span className="dot" style={{ background: sender.kind === 'none' ? '#c0392b' : '#9bb22a' }} />
            <strong>Active sender:</strong> <span>{sender.label}</span>
            <span className="muted">· every email goes only to {recipient || 'EMAIL_TEST_RECIPIENT (not set yet)'}</span>
          </div>

          {error && <div className="notice error">{error}</div>}

          {!error && rows.length === 0 && (
            <div className="empty">
              No companies yet. <Link href="/">Run a list</Link> to see results here.
            </div>
          )}

          {rows.length > 0 && (
            <div className="rtable">
              <div className="rhead" aria-hidden="true">
                <span>Company</span>
                <span>Status</span>
                <span>Verdict</span>
                <span>Flags</span>
                <span>Contact</span>
                <span>Time</span>
              </div>
              {rows.map((r) => {
                const nFlags = Array.isArray(r.flags) ? r.flags.length : 0;
                return (
                  <Link key={r.id} href={`/results/${r.id}`} className="rrow">
                    <span className="company">
                      {r.company_name || r.domain}
                      <small>
                        {r.domain}
                        {r.email_status ? ` · email ${r.email_status}` : ''}
                      </small>
                    </span>
                    <span>
                      <StatusTag status={r.status} />
                    </span>
                    <span className="reason-cell">
                      <RunSummary p={presentRun(r)} compact hideTag />
                    </span>
                    <span className={`cell-extra flags-n ${nFlags ? '' : 'zero'}`}>
                      <span className="k">Flags</span>
                      {nFlags}
                    </span>
                    <span className="cell-extra">
                      <span className="k">Contact</span>
                      {r.contact_name || contacts[r.contact_id] || <span className="muted">none</span>}
                      {r.contact_source ? (
                        <>
                          {' '}
                          <span className={`source-tag src-${r.contact_source}`}>{SOURCE_TAGS[r.contact_source]}</span>
                        </>
                      ) : null}
                    </span>
                    <span className="cell-extra num">
                      <span className="k">Time</span>
                      {r.seconds_taken != null ? `${Math.round(Number(r.seconds_taken))}s` : '–'}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
