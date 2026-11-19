// Text helpers: normalising, word counts and edit distance.

export function norm(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[‘’‚‛ʼ′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/[  -​  　]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function wordCount(s) {
  const t = String(s ?? '').trim();
  return t ? t.split(/\s+/).length : 0;
}

export function truncate(s, n) {
  const t = String(s ?? '');
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

// How much of the original email changed, 0-100, measured in words (word-level edit distance).
export function editPercent(original, final) {
  const a = String(original ?? '').trim().split(/\s+/).filter(Boolean);
  const b = String(final ?? '').trim().split(/\s+/).filter(Boolean);
  if (a.join(' ') === b.join(' ')) return 0;
  let prev = new Array(b.length + 1);
  let cur = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    const tmp = prev;
    prev = cur;
    cur = tmp;
  }
  const dist = prev[b.length];
  const pct = Math.round((dist / Math.max(a.length, b.length, 1)) * 100);
  return Math.max(1, Math.min(100, pct));
}
