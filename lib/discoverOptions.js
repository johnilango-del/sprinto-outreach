// Fixed Discover search for Sprinto's ideal customer (fit-rules.txt). There is no form: the rulebook already
// defines who to look for. Values are copied exactly from Hunter's API docs (industries.json, headcount bands).
//
// - B2B software / SaaS. Hunter has no separate fintech, healthtech or HR-tech *software* industries
//   (only "Financial Services", "Hospitals and Health Care", "Human Resources", which would bring in banks,
//   hospitals and HR agencies), so those are covered as keywords inside the software industries instead.
// - 11-500 people (fit-rules Step 1 rule 4: too big is out).
// - Anywhere in the world: no location filter. Selling in the US/UK/Europe is only a medium signal during research.
// - Agencies, IT consultancies, public companies, schools, government and non-profits are excluded (Step 1).

export const INDUSTRIES = [
  'Software Development',
  'Technology, Information and Internet',
  'Data Infrastructure and Analytics',
  'Data Security Software Products',
];

export const INDUSTRY_EXCLUDE = ['IT Services and IT Consulting'];

export const HEADCOUNT = ['11-50', '51-200', '201-500'];

export const COMPANY_TYPE_EXCLUDE = ['public company', 'educational', 'educational institution', 'government agency', 'non profit'];

// Any one keyword can match.
export const KEYWORDS = ['SaaS', 'B2B', 'fintech', 'healthtech', 'health IT', 'HR tech'];

export const QUERY = 'B2B SaaS software company';

export const MAX_PER_RUN = 10;

// Shown under the button and next to each company (Hunter's Discover reply only lists name, domain and email count).
export const SEARCH_SUMMARY = {
  industry: 'B2B software / SaaS',
  headcount: '11–500 people',
  location: 'anywhere',
};

export function buildDiscoverBody() {
  return {
    query: QUERY,
    industry: { include: INDUSTRIES, exclude: INDUSTRY_EXCLUDE },
    headcount: HEADCOUNT,
    company_type: { exclude: COMPANY_TYPE_EXCLUDE },
    keywords: { include: KEYWORDS, match: 'any' },
    limit: 100, // ask for the most Hunter allows; the app researches at most 10 new ones per run
  };
}
