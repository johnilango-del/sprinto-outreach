// Turns "https://www.LogPulse.io/about?x=1" into "logpulse.io".
export function normaliseDomain(input) {
  let s = String(input || '').trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  s = s.split(/[/?#\s]/)[0];
  s = s.replace(/^[^@]*@/, '');
  s = s.replace(/:\d+$/, '');
  s = s.replace(/^www\./, '');
  s = s.replace(/\.$/, '');
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s)) return null;
  return s;
}

export function hostBase(host) {
  return String(host || '').toLowerCase().replace(/^www\./, '').replace(/:\d+$/, '');
}

export function sameSite(host, domain) {
  const h = hostBase(host);
  return h === domain || h.endsWith('.' + domain);
}

export function pathLabel(url) {
  try {
    const u = new URL(url);
    return u.pathname === '/' || u.pathname === '' ? 'homepage' : u.pathname;
  } catch {
    return String(url);
  }
}

export function emailDomain(email) {
  const m = String(email || '').toLowerCase().trim().match(/@([^@\s>]+)$/);
  return m ? hostBase(m[1]) : '';
}
