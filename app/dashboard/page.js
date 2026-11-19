import Link from 'next/link';
import { loadRuns, latestPerDomain } from '@/lib/runsData';
import { Icon } from '../components/Icons';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Dashboard · Outreach Desk' };

const STATUS_ORDER = [
  ['GOOD_FIT', 'Good fit', 'var(--lime)'],
  ['GOOD_FIT_FLAGGED', 'Good fit, flagged', 'var(--amber)'],
  ['NOT_A_FIT', 'Not a fit', '#d9a3b0'],
  ['NEEDS_REVIEW', 'Needs review', '#b9a8ef'],
  ['NO_CONTACT', 'No contact', '#bdb5ba'],
  ['ERROR', 'Error', '#e59a92'],
];

const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) : null);

function Tile({ label, value, unit, sub, target, met }) {
  return (
    <div className="tile">
      <div className="eyebrow">{label}</div>
      <div className="n">
        {value ?? '–'}
        {value != null && unit ? <small> {unit}</small> : null}
      </div>
      {sub && <div className="sub">{sub}</div>}
      {target && (
        <div className="target">
          {met ? (
            <span className="tick" aria-label="target met">
              <Icon name="check" />
            </span>
          ) : null}
          <span>Target: {target}{met === false ? ' · not met yet' : ''}</span>
        </div>
      )}
    </div>
  );
}

function Bars({ rows }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="bars">
      {rows.map((r) => (
        <div className="bar-row" key={r.label}>
          <span>{r.label}</span>
          <div className="bar-track" aria-hidden="true">
            <div className="bar-fill" style={{ width: `${(r.value / max) * 100}%`, background: r.color }} />
          </div>
          <span className="v">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export default async function Dashboard() {
  const { runs, error } = await loadRuns(
    'id, created_at, domain, status, status_reason, flags, email_original, email_status, edit_percent, fit_agreement, seconds_taken, contact_source'
  );
  const companies = latestPerDomain(runs);
  const total = companies.length;

  const byStatus = Object.fromEntries(STATUS_ORDER.map(([k]) => [k, 0]));
  for (const c of companies) byStatus[c.status] = (byStatus[c.status] || 0) + 1;

  // Fit rate: good fits (incl. flagged and those only missing a contact) out of companies judged (errors excluded).
  const judged = total - byStatus.ERROR;
  const fits = byStatus.GOOD_FIT + byStatus.GOOD_FIT_FLAGGED + byStatus.NO_CONTACT;
  const fitRate = pct(fits, judged);

  // Top reasons for NOT_A_FIT: the part of the reason before the first colon.
  const reasonCounts = {};
  for (const c of companies.filter((c) => c.status === 'NOT_A_FIT')) {
    const key = String(c.status_reason || 'Other').split(':')[0].trim() || 'Other';
    reasonCounts[key] = (reasonCounts[key] || 0) + 1;
  }
  const topReasons = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);

  // Emails (all runs: these are human actions)
  const drafted = runs.filter((r) => r.email_original).length;
  const sentRuns = runs.filter((r) => r.email_status === 'sent');
  const sent = sentRuns.length;
  const skipped = runs.filter((r) => r.email_status === 'skipped').length;
  const editedAny = pct(sentRuns.filter((r) => (r.edit_percent ?? 0) > 0).length, sent);
  const heavy = pct(sentRuns.filter((r) => (r.edit_percent ?? 0) > 30).length, sent);
  const claimsFlagged = runs.filter((r) => Array.isArray(r.flags) && r.flags.some((f) => /claim not found on the site/.test(f))).length;

  const timed = companies.filter((c) => c.seconds_taken != null && c.status !== 'ERROR');
  const avgSeconds = timed.length ? Math.round(timed.reduce((s, c) => s + Number(c.seconds_taken), 0) / timed.length) : null;

  // Contacts found automatically: % of qualifying companies where Hunter found the person.
  const qualifying = companies.filter((c) => ['GOOD_FIT', 'GOOD_FIT_FLAGGED', 'NO_CONTACT'].includes(c.status));
  const byHunter = qualifying.filter((c) => c.contact_source === 'hunter' || c.contact_source === 'team_page_hunter').length;
  const byList = qualifying.filter((c) => c.contact_source === 'apollo_list').length;
  const autoFound = pct(byHunter, qualifying.length);

  const agree = runs.filter((r) => r.fit_agreement === 'agree').length;
  const disagree = runs.filter((r) => r.fit_agreement === 'disagree').length;
  const agreement = pct(agree, agree + disagree);

  return (
    <>
      <section className="plum-bg band">
        <div className="wrap">
          <div className="eyebrow">Dashboard</div>
          <h1>Is the desk doing its job?</h1>
          <p>Real data only, from the runs in your database. With only a few runs, the numbers will look small. That is expected.</p>
        </div>
      </section>
      <section className="wrap band-overlap">
        {error && <div className="notice error" style={{ marginBottom: 20 }}>{error}</div>}
        {!error && total === 0 && (
          <div className="card empty">
            No runs yet. <Link href="/">Run a list</Link> and the numbers will appear here.
          </div>
        )}

        <div className="tiles">
          <Tile label="Companies processed" value={total} sub={`${runs.length} run${runs.length === 1 ? '' : 's'} in total`} />
          <Tile label="Fit rate" value={fitRate} unit={fitRate != null ? '%' : ''} sub={`${fits} of ${judged} judged companies qualified (errors left out)`} />
          <Tile
            label="Avg time per company"
            value={avgSeconds}
            unit={avgSeconds != null ? 's' : ''}
            sub="Manual baseline, from the case brief: 15-20 minutes per company"
            target="under 2 minutes"
            met={avgSeconds == null ? undefined : avgSeconds < 120}
          />
          <Tile
            label="Fit agreement"
            value={agreement}
            unit={agreement != null ? '%' : ''}
            sub={`${agree} agree · ${disagree} disagree`}
            target="at least 80%"
            met={agreement == null ? undefined : agreement >= 80}
          />
          <Tile label="Emails drafted vs sent" value={`${drafted} / ${sent}`} sub={`${skipped} skipped`} />
          <Tile label="Sent emails edited at all" value={editedAny} unit={editedAny != null ? '%' : ''} sub={`of ${sent} sent`} />
          <Tile
            label="Heavily rewritten (over 30%)"
            value={heavy}
            unit={heavy != null ? '%' : ''}
            sub={`of ${sent} sent`}
            target="under 20%"
            met={heavy == null ? undefined : heavy < 20}
          />
          <Tile
            label="Contacts found automatically"
            value={autoFound}
            unit={autoFound != null ? '%' : ''}
            sub={`${byHunter} automatic (Hunter or team page) · ${byList} from your backup list · ${qualifying.length - byHunter - byList} none, of ${qualifying.length} qualifying`}
          />
          <Tile label="Claims flagged" value={claimsFlagged} sub="drafts that used a claim not found on the site" />
        </div>

        <div className="dash-grid">
          <div className="card">
            <div className="eyebrow" style={{ marginBottom: 14 }}>Companies by status</div>
            <Bars rows={STATUS_ORDER.map(([k, label, color]) => ({ label, value: byStatus[k] || 0, color }))} />
          </div>
          <div className="card">
            <div className="eyebrow" style={{ marginBottom: 14 }}>Emails: drafted, sent, skipped</div>
            <Bars
              rows={[
                { label: 'Drafted', value: drafted, color: '#b9a8ef' },
                { label: 'Sent', value: sent, color: 'var(--plum)' },
                { label: 'Skipped', value: skipped, color: '#bdb5ba' },
              ]}
            />
            <div className="eyebrow" style={{ margin: '26px 0 6px' }}>Top reasons for “Not a fit”</div>
            {topReasons.length === 0 ? (
              <div className="muted small">None yet.</div>
            ) : (
              <ul className="reasons">
                {topReasons.map(([r, n]) => (
                  <li key={r}>
                    <span>{r}</span>
                    <strong>{n}</strong>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
