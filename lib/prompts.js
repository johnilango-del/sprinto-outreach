import { getFitRules } from './fitRules.js';
import { SIGN_OFF } from './config.js';

function systemText(role) {
  return [
    'You are a careful research assistant working for the Growth Lead at Sprinto.',
    role,
    'Follow this rulebook exactly. It is the full text of fit-rules.txt:',
    '----- BEGIN fit-rules.txt -----',
    getFitRules().text,
    '----- END fit-rules.txt -----',
    'Hard rules: you fill FACT FIELDS only. You never decide the status, never decide whether there is "enough" information, and never choose or invent a contact.',
    'Every fact must come with an exact quote copied character-for-character from ONE of the pages given, plus that page URL exactly as labelled.',
    'A quote is one continuous piece of text from the page: no ellipses, no joining separate pieces, no paraphrasing, at most 30 words.',
    'If a fact is not on the pages, leave it empty. Reply with JSON only.',
  ].join('\n');
}

export function extractionPrompt({ domain, pages, certSummary }) {
  const pageText = pages
    .map((p) => `=== PAGE: ${p.url} ===\n${p.clean_text || '(no readable text)'}\n=== END PAGE: ${p.url} ===`)
    .join('\n\n');

  const user = `COMPANY WEBSITE: ${domain}

CERTIFICATION SCAN ALREADY DONE BY CODE ON THE RAW PAGES (footer included):
${certSummary}

PAGES FETCHED SO FAR (cleaned text, each labelled with its URL):
${pageText}

TASK: Fill the fact fields from the rulebook using only these pages. Return exactly this JSON shape:
{
  "company_name": "the company's own name as written on the site, or empty",
  "certified": {"value": "achieved" | "in_progress" | "", "quote": "", "source_url": ""},
  "b2b_saas": {"value": "yes" | "no" | "", "quote": "", "source_url": ""},
  "handles_data": {"value": "yes" | "no" | "", "quote": "", "source_url": ""},
  "stage": {"value": "short answer, e.g. 'Seed', 'Series B', '7 open roles', 'Enterprise tier on pricing'", "quote": "", "source_url": ""},
  "pressure_signals": [
    {"signal": "short plain-English name of the signal from Step 3", "strength": "strong" | "medium", "quote": "", "source_url": ""}
  ],
  "disqualifiers": [
    {"rule": "not_software" | "consumer_only" | "too_big" | "no_product", "reason": "one line", "quote": "", "source_url": ""}
  ]
}

Notes:
- b2b_saas "yes" needs a quote showing businesses/teams buy or sign up; "no" needs a quote showing it is not B2B software. Otherwise "".
- handles_data "yes" needs a quote showing the product stores, processes or connects to customer data.
- stage: only a named funding stage, 5 or more open roles listed, or an enterprise tier on pricing. Otherwise "".
- pressure_signals: one entry per distinct signal, strength exactly as Step 3 of the rulebook says. Empty list if none.
- disqualifiers: Step 1 rules 1, 2, 4, 5 only (certification is handled by code). Empty list if none apply.
- Leave a field as {"value": "", "quote": "", "source_url": ""} when the pages do not say it.`;

  return {
    system: systemText('Your job now: EXTRACTION. Read the company pages and fill the fact fields.'),
    user,
  };
}

export function writingPrompt({ domain, companyName, status, fields, signals, contact, titleCheckedByCode }) {
  const firstName = String(contact.person_name || '').trim().split(/\s+/)[0] || '';
  const facts = [];
  for (const [k, f] of Object.entries(fields)) {
    if (f && f.value) facts.push(`- ${k}: ${f.value}${f.quote ? ` | quote: "${f.quote}" | page: ${f.source_url}` : ''}`);
  }
  const sig = signals.map((s, i) => `${i + 1}. [${s.strength}] ${s.signal} | quote: "${s.quote}" | page: ${s.source_url}`);

  const user = `COMPANY: ${companyName || domain} (${domain})
STATUS SET BY CODE: ${status}

VERIFIED FACT FIELDS (every quote below was checked by code against the page text):
${facts.join('\n') || '- none'}

VERIFIED PRESSURE SIGNALS:
${sig.join('\n') || '- none'}

CONTACT (picked by code from Hunter or the Growth Lead's Apollo list; do not change or replace):
- First name: ${firstName}
- Title: ${contact.title || '(no title given)'}

TASK: Return exactly this JSON shape:
{
  "title_fits": {"value": "yes" | "no", "reason": "one line: does this title fit the company's size per Step 4?"},
  "pain_points": [
    {"pain": "pain point from Step 5 for this person's role", "why": "one line linking it to the signal", "signal": "which signal", "quote": "the exact verified quote it relies on", "source_url": ""},
    {"pain": "", "why": "", "signal": "", "quote": "", "source_url": ""}
  ],
  "email_subject": "short, plain, specific, no clickbait",
  "email_body": "the email",
  "facts_used": ["every exact quote from the verified list above that the email relies on"]
}

Email rules (Step 6): plain text; start with "Hi ${firstName},"; ONE specific hook taken from a verified quote; connect it to ONE of the two pain points in their language; one sentence on Sprinto (helps SaaS teams get audit-ready for SOC 2 in weeks, with a dedicated compliance expert, without pulling engineers off product); one soft ask; under 120 words including greeting and sign-off; no emojis; no exclamation marks; no generic openers; sign off exactly:
${SIGN_OFF}
Every fact about the company must come from the verified quotes above. Do not mention anything else about them.
${titleCheckedByCode ? 'Note: code has already decided the title does not fit; still return title_fits but it will be ignored.' : ''}`;

  return {
    system: systemText('Your job now: WRITING. Pick two pain points and draft the first cold email.'),
    user,
  };
}
