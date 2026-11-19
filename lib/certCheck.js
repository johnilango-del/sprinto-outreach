// CERTIFICATION CHECK IN CODE, on the RAW page text (footer included), before cleaning.
// Implements the NEARBY-WORDS RULE from fit-rules.txt, Step 1 rule 3.

const CERT_RE = /\bSOC\s?-?\s?2\b|\bISO\s*\/?\s*(?:IEC\s*)?27001\b/gi;

const IN_PROGRESS_RE =
  /\b(?:in[\s-]progress|undergoing|underway|under way|pursuing|working towards?|expected|planned|planning|upcoming|coming soon|targets?|targeting|targeted|roadmap|in the process of|preparing for|on track (?:for|to))\b|\b(?:Q[1-4]|H[12])\s*'?(?:20)?\d{2}\b/i;

const ACHIEVED_RE = /\b(?:certified|compliant|attested|audited|report (?:is )?available|achieved)\b/i;

// The sentence inside `line` that contains character `index`, through to the end of the line.
// Returns the text and where the match sits inside it.
function sentenceAt(line, index) {
  let start = 0;
  const re = /[.!?](?=\s)/g;
  let m;
  while ((m = re.exec(line))) {
    if (m.index < index) start = m.index + 1;
    else break;
  }
  while (start < line.length && /\s/.test(line[start])) start++;
  return { text: line.slice(start).trimEnd(), at: index - start };
}

// A readable window of the sentence around the match (still an exact substring of the page).
// keepEnd = true keeps everything up to the end of the line, so the next line can be appended.
function windowAround(sentence, at, keepEnd) {
  let s = Math.max(0, at - 90);
  if (s > 0) {
    const sp = sentence.indexOf(' ', s);
    s = sp >= 0 && sp < at ? sp + 1 : s;
  }
  let e = keepEnd ? sentence.length : Math.min(sentence.length, at + 140);
  if (!keepEnd && e < sentence.length) {
    const sp = sentence.lastIndexOf(' ', e);
    if (sp > at + 10) e = sp;
  }
  return sentence.slice(s, e).trim();
}

function cut(s, n = 200) {
  return s.length > n ? s.slice(0, n) : s;
}

// Classifies every SOC 2 / ISO 27001 mention on one page.
export function scanPage(rawText, url) {
  const lines = String(rawText || '').split('\n');
  const mentions = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    CERT_RE.lastIndex = 0;
    let m;
    while ((m = CERT_RE.exec(line))) {
      const cert = /iso/i.test(m[0]) ? 'ISO 27001' : 'SOC 2';
      const { text: sentence, at } = sentenceAt(line, m.index);
      const next = [lines[i + 1] || '', lines[i + 2] || ''];
      const tail = windowAround(sentence, at, true);
      // in-progress words: same sentence, or the next two lines
      let type = null;
      let quote = windowAround(sentence, at, false);
      if (IN_PROGRESS_RE.test(sentence)) {
        type = 'in_progress';
      } else if (next[0] && IN_PROGRESS_RE.test(next[0])) {
        type = 'in_progress';
        quote = tail + ' ' + cut(next[0]);
      } else if (next[1] && IN_PROGRESS_RE.test(next[1])) {
        type = 'in_progress';
        // only quote the middle line in full if it is short; the quote must stay contiguous
        quote = next[0].length <= 200 ? tail + ' ' + next[0] + ' ' + cut(next[1]) : cut(next[1]);
      } else if (ACHIEVED_RE.test(sentence)) {
        type = 'achieved';
      } else if (next[0] && ACHIEVED_RE.test(next[0])) {
        type = 'achieved';
        quote = tail + ' ' + cut(next[0]);
      } else {
        type = 'ambiguous';
      }
      mentions.push({ cert, type, quote: quote.trim(), source_url: url });
    }
  }
  return mentions;
}

// Combines all pages into one certification verdict.
// status: 'certified' | 'in_progress' | 'ambiguous' | 'none'
export function certVerdict(pages) {
  const mentions = [];
  for (const p of pages) {
    if (p.raw_text) mentions.push(...scanPage(p.raw_text, p.url));
  }
  // de-duplicate identical quotes (same footer on every page)
  const seen = new Set();
  const uniq = mentions.filter((m) => {
    const k = m.type + '|' + m.quote.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const achieved = uniq.filter((m) => m.type === 'achieved');
  const inProgress = uniq.filter((m) => m.type === 'in_progress');
  const ambiguous = uniq.filter((m) => m.type === 'ambiguous');
  let status = 'none';
  if (achieved.length) status = 'certified';
  else if (inProgress.length) status = 'in_progress';
  else if (ambiguous.length) status = 'ambiguous';
  return { status, achieved, inProgress, ambiguous, all: uniq };
}

// Used to double-check a certification quote the AI returned.
export function classifyQuote(quote) {
  const q = String(quote || '');
  if (!new RegExp(CERT_RE.source, 'i').test(q)) return 'no_cert_named';
  if (IN_PROGRESS_RE.test(q)) return 'in_progress';
  if (ACHIEVED_RE.test(q)) return 'achieved';
  return 'ambiguous';
}
