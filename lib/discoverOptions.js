// Discover filter choices, pre-filled from Sprinto's ideal customer in fit-rules.txt:
// B2B SaaS / software, not too big (11-500 staff), headquarters in the US, UK or Europe.
// Values are copied exactly from Hunter's API docs (industries.json, headcount bands, location fields).
// Pure data: used by both the browser form and the server.

export const INDUSTRY_OPTIONS = [
  { value: 'Software Development', label: 'Software development', default: true },
  { value: 'Technology, Information and Internet', label: 'Technology, information and internet', default: true },
  { value: 'Data Infrastructure and Analytics', label: 'Data infrastructure and analytics', default: true },
  { value: 'Data Security Software Products', label: 'Data security software', default: true },
  { value: 'Computer and Network Security', label: 'Computer and network security', default: false },
  { value: 'Financial Services', label: 'Financial services (fintech)', default: false },
];

// Agencies / consultancies are a Step 1 disqualifier, so they are always left out.
export const INDUSTRY_EXCLUDE = ['IT Services and IT Consulting'];

// The largest bands (1001+) are never offered: Step 1 rule 4, "too big".
export const HEADCOUNT_OPTIONS = [
  { value: '1-10', label: '1-10', default: false },
  { value: '11-50', label: '11-50', default: true },
  { value: '51-200', label: '51-200', default: true },
  { value: '201-500', label: '201-500', default: true },
  { value: '501-1000', label: '501-1,000', default: false },
];

export const REGION_OPTIONS = [
  { value: 'US', label: 'United States', location: { country: 'US' }, default: true },
  { value: 'GB', label: 'United Kingdom', location: { country: 'GB' }, default: true },
  { value: 'EU', label: 'Europe', location: { continent: 'Europe' }, default: true },
];

// Public companies (too big), education, government and non-profits are always left out.
export const COMPANY_TYPE_EXCLUDE = ['public company', 'educational', 'educational institution', 'government agency', 'non profit'];

export const DEFAULT_FILTERS = {
  query: 'B2B SaaS software company',
  keywords: 'SaaS, B2B',
  industries: INDUSTRY_OPTIONS.filter((o) => o.default).map((o) => o.value),
  headcount: HEADCOUNT_OPTIONS.filter((o) => o.default).map((o) => o.value),
  regions: REGION_OPTIONS.filter((o) => o.default).map((o) => o.value),
};

// Turns the form into the Hunter Discover request body, accepting only known values.
export function buildDiscoverBody(f) {
  const pick = (list, allowed) => [...new Set((Array.isArray(list) ? list : []).filter((v) => allowed.includes(v)))];
  const industries = pick(f?.industries, INDUSTRY_OPTIONS.map((o) => o.value));
  const headcount = pick(f?.headcount, HEADCOUNT_OPTIONS.map((o) => o.value));
  const regions = pick(f?.regions, REGION_OPTIONS.map((o) => o.value));
  const keywords = String(f?.keywords || '')
    .split(',')
    .map((k) => k.trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, 10);
  const query = String(f?.query || '').replace(/\s+/g, ' ').trim().slice(0, 200);

  const body = {};
  if (query) body.query = query;
  body.industry = { exclude: INDUSTRY_EXCLUDE };
  if (industries.length) body.industry.include = industries;
  if (headcount.length) body.headcount = headcount;
  if (regions.length) body.headquarters_location = { include: REGION_OPTIONS.filter((o) => regions.includes(o.value)).map((o) => o.location) };
  body.company_type = { exclude: COMPANY_TYPE_EXCLUDE };
  if (keywords.length) body.keywords = { include: keywords, match: 'any' };
  body.limit = 100; // ask for the most Hunter allows; the app shows at most 10 new ones
  return { body, summary: { industries, headcount, regions, keywords, query } };
}
