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

// No natural-language "query": Hunter's docs present it as an alternative to the filters (an AI assistant picks
// its own filters), which can replace ours. The manual filters are sent alone so headcount is applied as written.

export const MAX_PER_RUN = 10;
export const PAGE_SIZE = 100; // Hunter's maximum per request

// Size safety net applied in code after Discover answers, because filters a plan doesn't include are ignored silently.
// emails_count (emails Hunter knows for the domain) is a rough size proxy: 11-500 people usually means 5-300 emails.
export const MIN_EMAILS = 5;
export const MAX_EMAILS = 300;

// Obvious large / public companies that should never be suggested (not exhaustive: the size proxy is the main guard).
export const LARGE_COMPANY_DOMAINS = [
  'opentext.com', 'infor.com', 'servicenow.com', 'intuit.com', 'ukg.com', 'databricks.com', 'datadoghq.com', 'hubspot.com',
  'salesforce.com', 'oracle.com', 'sap.com', 'microsoft.com', 'google.com', 'amazon.com', 'aws.amazon.com', 'ibm.com',
  'adobe.com', 'workday.com', 'atlassian.com', 'zendesk.com', 'shopify.com', 'stripe.com', 'snowflake.com', 'cloudflare.com',
  'okta.com', 'twilio.com', 'zoom.us', 'slack.com', 'dropbox.com', 'box.com', 'docusign.com', 'paypal.com', 'cisco.com',
  'vmware.com', 'palantir.com', 'crowdstrike.com', 'paloaltonetworks.com', 'splunk.com', 'elastic.co', 'mongodb.com',
  'confluent.io', 'gitlab.com', 'github.com', 'atlassian.net', 'sage.com', 'xero.com', 'freshworks.com', 'zoho.com',
  'monday.com', 'asana.com', 'notion.so', 'figma.com', 'canva.com', 'meta.com', 'apple.com', 'netflix.com', 'uber.com',
];
export const LARGE_COMPANY_NAMES = [
  'opentext', 'infor', 'servicenow', 'intuit', 'ukg', 'databricks', 'datadog', 'hubspot', 'salesforce', 'oracle', 'sap',
  'microsoft', 'google', 'amazon', 'ibm', 'adobe', 'workday', 'atlassian', 'zendesk', 'shopify', 'snowflake', 'cloudflare',
  'okta', 'twilio', 'zoom', 'dropbox', 'docusign', 'paypal', 'cisco', 'vmware', 'palantir', 'crowdstrike', 'palo alto networks',
  'splunk', 'mongodb', 'gitlab', 'github', 'sage', 'xero', 'freshworks', 'zoho',
];

export function buildDiscoverBody(offset = 0) {
  const body = {
    industry: { include: INDUSTRIES, exclude: INDUSTRY_EXCLUDE },
    headcount: HEADCOUNT,
    company_type: { exclude: COMPANY_TYPE_EXCLUDE },
    keywords: { include: KEYWORDS, match: 'any' },
    limit: PAGE_SIZE, // ask for the most Hunter allows; the app researches at most 10 new ones per run
  };
  if (offset > 0) body.offset = offset; // paging: paid Hunter plans only
  return body;
}
