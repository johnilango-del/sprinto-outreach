import { db } from './supabase.js';
import { extractPage } from './html.js';

// A normal desktop browser User-Agent. Plain HTTP requests only, no headless browser.
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const TIMEOUT_MS = 10000;
const PAUSE_MS = 1000;
const CACHE_DAYS = 7;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- robots.txt ----------
export function parseRobots(txt) {
  const groups = [];
  let cur = null;
  let lastWasAgent = false;
  for (const rawLine of String(txt).split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const val = line.slice(idx + 1).trim();
    if (key === 'user-agent') {
      if (!cur || !lastWasAgent) {
        cur = { agents: [], rules: [] };
        groups.push(cur);
      }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else if (key === 'allow' || key === 'disallow') {
      if (cur) cur.rules.push({ allow: key === 'allow', path: val });
      lastWasAgent = false;
    } else {
      lastWasAgent = false;
    }
  }
  // We identify as a normal browser, so the "*" group applies.
  const rules = groups.filter((g) => g.agents.includes('*')).flatMap((g) => g.rules);
  return rules;
}

function ruleMatches(pattern, path) {
  if (!pattern) return false;
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const re = new RegExp(
    '^' + body.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + (anchored ? '$' : '')
  );
  return re.test(path);
}

export function robotsAllows(rules, path) {
  if (!rules || rules.length === 0) return true;
  let best = null;
  for (const r of rules) {
    if (!r.path) continue; // "Disallow:" with nothing = allow everything
    if (ruleMatches(r.path, path)) {
      if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r;
    }
  }
  return best ? best.allow : true;
}

// ---------- cache (Supabase "pages" table) ----------
async function readCache(url) {
  try {
    const since = new Date(Date.now() - CACHE_DAYS * 864e5).toISOString();
    const { data, error } = await db()
      .from('pages')
      .select('url, final_url, fetched_at, http_status, title, raw_text, clean_text, word_count, links, error')
      .eq('url', url)
      .gte('fetched_at', since)
      .not('http_status', 'is', null)
      .maybeSingle();
    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}

async function writeCache(rec) {
  try {
    await db()
      .from('pages')
      .upsert(
        {
          url: rec.url,
          final_url: rec.final_url ?? null,
          fetched_at: new Date().toISOString(),
          http_status: rec.http_status ?? null,
          title: rec.title ?? null,
          raw_text: rec.raw_text ?? null,
          clean_text: rec.clean_text ?? null,
          word_count: rec.word_count ?? null,
          links: rec.links ?? [],
          error: rec.error ?? null,
        },
        { onConflict: 'url' }
      );
  } catch {
    // the cache is a nice-to-have; a failed write never stops a run
  }
}

// ---------- fetcher ----------
// One fetcher per company run: remembers robots.txt and enforces a 1-second pause per site.
export function createFetcher() {
  const lastHit = new Map();
  const robots = new Map();

  async function politeFetch(url, timeoutMs = TIMEOUT_MS) {
    const host = new URL(url).host;
    const last = lastHit.get(host);
    if (last != null) {
      const wait = PAUSE_MS - (Date.now() - last);
      if (wait > 0) await sleep(wait);
    }
    lastHit.set(host, Date.now());
    try {
      return await fetch(url, {
        headers: {
          'User-Agent': UA,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'follow',
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } finally {
      lastHit.set(host, Date.now());
    }
  }

  async function robotsFor(origin) {
    if (robots.has(origin)) return robots.get(origin);
    let rules = null;
    try {
      const res = await politeFetch(origin + '/robots.txt');
      if (res.ok) {
        const txt = (await res.text()).slice(0, 500000);
        // Some sites answer robots.txt with an HTML page; ignore that.
        if (!/<html/i.test(txt.slice(0, 500))) rules = parseRobots(txt);
      }
    } catch {
      rules = null; // unreachable robots.txt = no rules
    }
    robots.set(origin, rules);
    return rules;
  }

  async function allowedByRobots(url) {
    const u = new URL(url);
    const rules = await robotsFor(u.origin);
    return robotsAllows(rules, u.pathname + u.search);
  }

  // Returns { url, final_url, http_status, title, raw_text, clean_text, word_count, links, error, blocked, from_cache }
  async function getPage(url) {
    const cached = await readCache(url);
    if (cached) return { ...cached, from_cache: true };

    if (!(await allowedByRobots(url))) {
      return { url, blocked: true, error: 'blocked by robots.txt', from_cache: false };
    }

    let res;
    try {
      res = await politeFetch(url);
    } catch (e) {
      const msg =
        e?.name === 'TimeoutError' || e?.name === 'AbortError'
          ? 'timed out after 10 seconds'
          : `could not connect (${e?.cause?.code || e?.message || 'network error'})`;
      return { url, error: msg, from_cache: false };
    }

    const status = res.status;
    const finalUrl = res.url || url;
    if (!res.ok) {
      const rec = { url, final_url: finalUrl, http_status: status, error: `HTTP ${status}` };
      await writeCache(rec);
      return { ...rec, from_cache: false };
    }
    const ct = res.headers.get('content-type') || '';
    if (ct && !/html|text\/plain|xml/i.test(ct)) {
      const rec = { url, final_url: finalUrl, http_status: status, error: `not a web page (${ct.split(';')[0]})` };
      await writeCache(rec);
      return { ...rec, from_cache: false };
    }
    let html;
    try {
      html = (await res.text()).slice(0, 3000000);
    } catch (e) {
      return { url, error: `could not read the page (${e?.name === 'TimeoutError' ? 'timed out' : e?.message})`, from_cache: false };
    }
    const ex = extractPage(html, finalUrl);
    const rec = { url, final_url: finalUrl, http_status: status, ...ex, error: null };
    await writeCache(rec);
    return { ...rec, from_cache: false };
  }

  return { getPage };
}
