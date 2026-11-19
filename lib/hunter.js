// Hunter.io: Domain Search (Source 1) and Email Finder (Source 2) from fit-rules.txt, Step 4.
// The API key is read on the server only. Never log or display the key or the request URL.

import { env } from './config.js';
import { db } from './supabase.js';
import { isGenericInbox } from './contacts.js';
import { norm } from './text.js';

const CACHE_DAYS = 30;
export const MIN_CONFIDENCE = 70;

const UNAVAILABLE = {
  401: 'invalid or missing API key',
  402: 'out of credits (payment required)',
  403: 'access denied or rate limit reached',
  429: 'out of credits or too many requests',
};

export function hunterEnabled() {
  return !!env('HUNTER_API_KEY');
}

// One cache table for both endpoints. Domain Search is saved under the plain domain,
// Email Finder under "finder:<domain>:<first> <last>".
async function readCache(cacheKey) {
  try {
    const since = new Date(Date.now() - CACHE_DAYS * 864e5).toISOString();
    const { data, error } = await db()
      .from('hunter_results')
      .select('fetched_at, raw')
      .eq('domain', cacheKey)
      .gte('fetched_at', since)
      .maybeSingle();
    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}

async function writeCache(cacheKey, raw) {
  try {
    await db()
      .from('hunter_results')
      .upsert({ domain: cacheKey, fetched_at: new Date().toISOString(), raw }, { onConflict: 'domain' });
  } catch {
    // a failed cache write never stops a run
  }
}

// Shared GET. Returns { ok: true, data, from_cache } or { ok: false, unavailable, reason }. Never throws.
async function hunterGet(endpoint, params, cacheKey, { notFoundIsEmpty = false } = {}) {
  const key = env('HUNTER_API_KEY');
  if (!key) return { ok: false, skipped: true, reason: 'no HUNTER_API_KEY set' };

  const cached = await readCache(cacheKey);
  if (cached) return { ok: true, data: cached.raw, from_cache: true };

  const qs = new URLSearchParams({ ...params, api_key: key });
  let res;
  try {
    res = await fetch(`https://api.hunter.io/v2/${endpoint}?${qs.toString()}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
  } catch (e) {
    const timeout = e?.name === 'TimeoutError' || e?.name === 'AbortError';
    return { ok: false, unavailable: true, reason: timeout ? 'Hunter did not answer within 10 seconds' : 'could not reach Hunter' };
  }

  if (res.status === 404 && notFoundIsEmpty) {
    const empty = { data: { email: null, score: null } };
    await writeCache(cacheKey, empty);
    return { ok: true, data: empty, from_cache: false };
  }

  if (!res.ok) {
    let detail = '';
    try {
      const j = await res.json();
      detail = String(j?.errors?.[0]?.details || '').replace(/api_key=\S+/gi, '').slice(0, 140);
    } catch {}
    const base = UNAVAILABLE[res.status] || `Hunter answered HTTP ${res.status}`;
    return { ok: false, unavailable: true, status: res.status, reason: detail ? `${base} (${detail})` : base };
  }

  let data;
  try {
    data = await res.json();
  } catch {
    return { ok: false, unavailable: true, reason: 'Hunter sent an unreadable reply' };
  }
  await writeCache(cacheKey, data);
  return { ok: true, data, from_cache: false };
}

export function hunterDomainSearch(domain) {
  return hunterGet('domain-search', { domain, limit: '10' }, domain);
}

export function hunterEmailFinder(domain, firstName, lastName) {
  const cacheKey = `finder:${domain}:${norm(firstName)} ${norm(lastName)}`;
  return hunterGet('email-finder', { domain, first_name: firstName, last_name: lastName }, cacheKey, { notFoundIsEmpty: true });
}

// ---------- ranking, in CODE (same ranking for every source) ----------

const NEVER_RE =
  /\b(sales|business development|bd|bdr|sdr|marketing|growth|account|accounts|partnerships?|intern|internship|assistant)\b/i;

const SECURITY_RE =
  /\b(ciso|chief information security officer|chief security officer|head of (?:information )?security|security lead|lead,? security|compliance lead|head of compliance|grc|governance,? risk)\b/i;
const CTO_RE = /\b(cto|chief technology officer|chief technical officer)\b/i;
const ENG_HEAD_RE = /\b(vp|vice president|head)\b[^,;|]*\bengineering\b|\bvp eng\b/i;
const FOUNDER_RE = /\b(ceo|chief executive officer|founder|co-founder|cofounder|co founder)\b/i;

export const ROLE_NAMES = { security: 'security / compliance lead', cto: 'CTO', eng: 'VP / Head of Engineering', founder: 'CEO / founder' };

export function isNeverRole(position) {
  return NEVER_RE.test(String(position || ''));
}

// Lower number = better. At a small company a founder outranks a VP / Head of Engineering.
export function roleRank(position, smallCompany) {
  const p = String(position || '');
  if (!p.trim() || NEVER_RE.test(p)) return null;
  const ranks = [];
  if (SECURITY_RE.test(p)) ranks.push({ rank: 1, role: 'security' });
  if (CTO_RE.test(p)) ranks.push({ rank: 2, role: 'cto' });
  if (ENG_HEAD_RE.test(p)) ranks.push({ rank: smallCompany ? 4 : 3, role: 'eng' });
  if (FOUNDER_RE.test(p)) ranks.push({ rank: smallCompany ? 3 : 4, role: 'founder' });
  if (!ranks.length) return null;
  ranks.sort((a, b) => a.rank - b.rank);
  return ranks[0];
}

// Source 1 pick. Returns { pick, considered, eligible, note, summary }
export function pickFromHunter(json, { smallCompany }) {
  const emails = Array.isArray(json?.data?.emails) ? json.data.emails : [];
  const eligible = [];
  const rejected = { generic: 0, lowConfidence: 0, noName: 0, salesMarketing: 0, notRanked: 0 };
  for (const e of emails) {
    const email = String(e?.value || '').trim();
    const first = String(e?.first_name || '').trim();
    const confidence = Number(e?.confidence ?? 0);
    if (!email || e?.type === 'generic' || isGenericInbox(email)) {
      rejected.generic++;
      continue;
    }
    if (!first) {
      rejected.noName++;
      continue;
    }
    if (!(confidence >= MIN_CONFIDENCE)) {
      rejected.lowConfidence++;
      continue;
    }
    if (isNeverRole(e?.position)) {
      rejected.salesMarketing++;
      continue;
    }
    const r = roleRank(e?.position, smallCompany);
    if (!r) {
      rejected.notRanked++;
      continue;
    }
    eligible.push({
      person_name: [first, String(e?.last_name || '').trim()].filter(Boolean).join(' '),
      title: String(e.position).trim(),
      email: email.toLowerCase(),
      confidence,
      rank: r.rank,
      role: r.role,
    });
  }
  eligible.sort((a, b) => a.rank - b.rank || b.confidence - a.confidence);
  const pick = eligible[0] || null;

  let note = '';
  let summary = '';
  if (pick) {
    const smallNote = smallCompany && pick.role === 'founder' ? '; small company, so a founder ranks above a VP of Engineering' : '';
    note = `Found by Hunter: ${pick.title}, top-ranked role found (${ROLE_NAMES[pick.role]}${smallNote}) among ${emails.length} people listed, email confidence ${pick.confidence}%`;
    summary = `found ${pick.person_name} (${pick.title}, ${pick.confidence}%)`;
  } else {
    const why = [];
    if (rejected.salesMarketing) why.push(`${rejected.salesMarketing} sales/marketing`);
    if (rejected.generic) why.push(`${rejected.generic} generic`);
    if (rejected.lowConfidence) why.push(`${rejected.lowConfidence} under ${MIN_CONFIDENCE}% confidence`);
    if (rejected.noName) why.push(`${rejected.noName} without a name`);
    if (rejected.notRanked) why.push(`${rejected.notRanked} other roles`);
    summary = emails.length
      ? `${emails.length} ${emails.length === 1 ? 'person' : 'people'} listed, none in the ranking (${why.join(', ')})`
      : 'no people listed for this domain';
  }
  return { pick, considered: emails.length, eligible: eligible.length, note, summary };
}
