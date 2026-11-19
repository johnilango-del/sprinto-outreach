// The clearly separated summary of one company: verdict, Action needed, Warnings, Why, Contact.
// No hooks, so it works both on the server (Results, Why card) and in the browser (Run page).
import StatusTag from './StatusTag';
import { Icon } from './Icons';

export function ContactLine({ contact }) {
  if (!contact) return null;
  return (
    <div className="contact-line">
      <Icon name="person" />
      <div>
        <div>
          <strong>{contact.name}</strong>
          {contact.title ? `, ${contact.title}` : ''}{' '}
          <span className={`source-tag src-${contact.source || 'none'}`}>{contact.source_tag}</span>
        </div>
        {contact.pick_reason && <div className="small muted">{contact.pick_reason}</div>}
      </div>
    </div>
  );
}

export function ActionBox({ items }) {
  if (!items?.length) return null;
  return (
    <div className="alert-box action" role="alert">
      <div className="alert-head">
        <Icon name="todo" /> Action needed
      </div>
      <ul>
        {items.map((a, i) => (
          <li key={i}>{a}</li>
        ))}
      </ul>
    </div>
  );
}

export function WarningBox({ items }) {
  if (!items?.length) return null;
  return (
    <div className="alert-box warn">
      <div className="alert-head">
        <Icon name="alert" /> Warnings ({items.length})
      </div>
      <ul>
        {items.map((w, i) => (
          <li key={i}>{w}</li>
        ))}
      </ul>
    </div>
  );
}

export function WhyList({ why }) {
  if (!why) return null;
  const hasSignals = why.signals?.length > 0;
  if (!hasSignals && !why.rule) return null;
  return (
    <div className="why-box">
      <div className="alert-head muted-head">
        <Icon name="facts" /> Why
      </div>
      {why.rule && <p className="why-rule">{why.rule}</p>}
      {hasSignals && (
        <ul>
          {why.signals.map((s, i) => (
            <li key={i}>
              {s.signal} · <span className={`strength ${s.strength}`}>{s.strength} +{s.points}</span>
              {s.page ? <span className="muted"> · {s.page}</span> : null}
            </li>
          ))}
          <li className="why-total">
            Total: {why.points} point{why.points === 1 ? '' : 's'} (2 or more qualifies)
          </li>
        </ul>
      )}
    </div>
  );
}

export default function RunSummary({ p, compact = false, hideTag = false }) {
  if (!p) return null;
  if (compact) {
    return (
      <div className="summary compact">
        <div className="verdict-line">
          {!hideTag && <StatusTag status={p.status} />}
          <span>{p.verdict}</span>
        </div>
        {(p.actions.length > 0 || p.warnings.length > 0) && (
          <div className="chips">
            {p.actions.length > 0 && (
              <span className="chip chip-action">
                <Icon name="todo" size={13} /> Action needed: {p.actions[0]}
              </span>
            )}
            {p.warnings.length > 0 && (
              <span className="chip chip-warn">
                <Icon name="alert" size={13} /> {p.warnings.length} warning{p.warnings.length === 1 ? '' : 's'}
              </span>
            )}
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="summary">
      <div className="verdict-line">
        {!hideTag && <StatusTag status={p.status} />}
        <span className="verdict-text">{p.verdict}</span>
      </div>
      <ActionBox items={p.actions} />
      <WarningBox items={p.warnings} />
      <WhyList why={p.why} />
      <ContactLine contact={p.contact} />
    </div>
  );
}
