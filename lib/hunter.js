// Hunter.io Domain Search: the automatic contact source (fit-rules.txt, Step 4, Source 1).
// The API key is read on the server only. Never log or display the key or the request URL.

import { env } from './config.js';
import { db } from './supabase.js';
import { isGenericInbox } from './contacts.js';

const CACHE_DAYS = 30;
const MIN_CONFIDENCE = 70;

const UNAVAILABLE = {
  401: 'invalid or missing API key',
  402: 'out of credits (payment required)',
  403: 'access denied or rate limit reached',
  429: 'out of credits or too many requests',
};

export function hunterEnabled() {
  return !!env('HUNTER_API_KEY');
}

async function readCache(domain) {
  try {
    const since = new Date(Date.now() - CACHE_DAYS * 864e5).toISOString();
    const { data, error } = await db()
      .from('hunter_results')
      .select('fetched_at, raw')
      .eq('domain', domain)
      .gte('fetched_at', since)
      .maybeSingle();
    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}

async function writeCache(domain, raw) {
  try {
    await db()
      .from('hunter_results')
      .upsert({ domain, fetched_at: new Date().toISOString(), raw }, { onConflict: 'domain' });
  } catch {
    // a failed cache write never stops a run
  }
}

// Returns { ok: true, data, from_cache } or { ok: false, reason }. Never throws.
export async function hunterDomainSearch(domain) {
  const key = env('HUNTER_API_KEY');
  if (!key) return { ok: false, skipped: true, reason: 'no HUNTER_API_KEY set' };

  const cached = await readCache(domain);
  if (cached) return { ok: true, data: cached.raw, from_cache: true };

  const params = new URLSearchParams({ domain, limit: '10', api_key: key });
  let res;
  try {
    res = await fetch(`https://api.hunter.io/v2/domain-search?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
  } catch (e) {
    const timeout = e?.name === 'TimeoutError' || e?.name === 'AbortError';
    return { ok: false, reason: timeout ? 'Hunter did not answer within 10 seconds' : 'could not reach Hunter' };
  }

  if (!res.ok) {
    let detail = '';
    try {
      const j = await res.json();
      detail = String(j?.errors?.[0]?.details || '').replace(/api_key=\S+/gi, '').slice(0, 140);
    } catch {}
    const base = UNAVAILABLE[res.status] || `Hunter answered HTTP ${res.status}`;
    return { ok: false, status: res.status, reason: detail ? `${base} (${detail})` : base };
  }

  let data;
  try {
    data = await res.json();
  } catch {
    return { ok: false, reason: 'Hunter sent an unreadable reply' };
  }
  await writeCache(domain, data);
  return { ok: true, data, from_cache: false };
}

// ---------- picking the person, in CODE ----------

const NEVER_RE =
  /\b(sales|business development|bd|bdr|sdr|marketing|growth|account|accounts|partnerships?|intern|internship|assistant)\b/i;

const SECURITY_RE =
  /\b(ciso|chief information security officer|chief security officer|head of (?:information )?security|security lead|lead,? security|compliance lead|head of compliance|grc|governance,? risk)\b/i;
const CTO_RE = /\b(cto|chief technology officer|chief technical officer)\b/i;
const ENG_HEAD_RE = /\b(vp|vice president|head)\b[^,;|]*\bengineering\b|\bvp eng\b/i;
const FOUNDER_RE = /\b(ceo|chief executive officer|founder|co-founder|cofounder|co founder)\b/i;

const ROLE_NAMES = { security: 'security / compliance lead', cto: 'CTO', eng: 'VP / Head of Engineering', founder: 'CEO / founder' };

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

// Returns { pick, considered, eligible, note }
export function pickFromHunter(json, { smallCompany }) {
  const emails = Array.isArray(json?.data?.emails) ? json.data.emails : [];
  const eligible = [];
  for (const e of emails) {
    const email = String(e?.value || '').trim();
    const first = String(e?.first_name || '').trim();
    const confidence = Number(e?.confidence ?? 0);
    if (!email || e?.type === 'generic' || isGenericInbox(email)) continue;
    if (!first) continue;
    if (!(confidence >= MIN_CONFIDENCE)) continue;
    const r = roleRank(e?.position, smallCompany);
    if (!r) continue;
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
  if (pick) {
    const smallNote = smallCompany && pick.role === 'founder' ? '; small company, so a founder ranks above a VP of Engineering' : '';
    note = `Found by Hunter: ${pick.title}, top-ranked role found (${ROLE_NAMES[pick.role]}${smallNote}) among ${emails.length} people listed, email confidence ${pick.confidence}%`;
  }
  return { pick, considered: emails.length, eligible: eligible.length, note };
}
