import { normaliseDomain, emailDomain } from './domain.js';
import { norm } from './text.js';

// Turns "logpulse.io, https://www.logpulse.nl" into ["logpulse.io", "logpulse.nl"].
export function parseDomains(input) {
  const list = Array.isArray(input) ? input : String(input || '').split(/[\s,;]+/);
  const out = [];
  for (const d of list) {
    const n = normaliseDomain(d);
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

// Code matches the company to the contacts table: by any of its domains, or by company name.
// The AI never chooses a contact.
export function matchContacts(contacts, siteDomains, companyName) {
  const domains = new Set(siteDomains.filter(Boolean));
  const name = norm(companyName);
  const byDomain = contacts.filter((c) => (c.domains || []).some((d) => domains.has(normaliseDomain(d))));
  if (byDomain.length) return { matches: byDomain, how: 'domain' };
  if (name) {
    const byName = contacts.filter((c) => norm(c.company_name) === name);
    if (byName.length) return { matches: byName, how: 'company name' };
  }
  return { matches: [], how: null };
}

const NOT_BUYER_RE =
  /\b(sales|business development|bd|bdr|sdr|marketing|growth|account|accounts|partnerships?|intern|internship|assistant)\b/i;
const GENERIC_INBOX_RE = /^(info|hello|hi|contact|sales|support|team|admin|office|hr|jobs|careers|marketing|press|help)@/i;

// Title check in code. Returns { decided: true, title_fits, reason } or { decided: false } (then Gemini is asked).
export function codeTitleCheck(title) {
  const t = String(title || '');
  if (NOT_BUYER_RE.test(t)) {
    return { decided: true, title_fits: 'no', reason: 'sales/marketing role is not the buyer; CTO, founder or security lead is' };
  }
  return { decided: false };
}

export function domainCheck(email, companyDomains) {
  const ed = emailDomain(email);
  if (!ed) return { domain_matches: 'no', email_domain: '' };
  const ok = companyDomains.some((d) => ed === d || ed.endsWith('.' + d));
  return { domain_matches: ok ? 'yes' : 'no', email_domain: ed };
}

export function isGenericInbox(email) {
  return GENERIC_INBOX_RE.test(String(email || '').trim());
}
