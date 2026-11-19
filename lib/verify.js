import { norm } from './text.js';

// CODE VERIFIES QUOTES: a quote must appear (case-insensitive, whitespace-normalised)
// in the raw or clean text of a fetched page. Returns the URL of the page it was found on, or null.
export function makeVerifier(pages) {
  const index = pages
    .filter((p) => p && (p.raw_text || p.clean_text))
    .map((p) => ({
      url: p.url,
      alt: p.final_url || p.url,
      text: norm(p.raw_text) + ' \u0000 ' + norm(p.clean_text),
    }));

  function sameUrl(entry, u) {
    if (!u) return false;
    const a = String(u).replace(/\/+$/, '').toLowerCase();
    return entry.url.replace(/\/+$/, '').toLowerCase() === a || entry.alt.replace(/\/+$/, '').toLowerCase() === a;
  }

  return function verify(quote, sourceUrl) {
    let q = norm(quote)
      .replace(/^["'\s]+|["'\s]+$/g, '')
      .replace(/(\.\.\.|…)$/, '')
      .trim();
    if (q.length < 3) return null;
    const variants = [q];
    if (/[.,;:]$/.test(q)) variants.push(q.slice(0, -1).trim());
    const preferred = index.find((e) => sameUrl(e, sourceUrl));
    for (const v of variants) {
      if (preferred && preferred.text.includes(v)) return preferred.url;
    }
    // Found on a different fetched page than the AI said: accept, but record the real page.
    for (const v of variants) {
      const other = index.find((e) => e.text.includes(v));
      if (other) return other.url;
    }
    return null;
  };
}
