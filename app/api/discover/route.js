import { hunterDiscover } from '@/lib/hunter';
import { buildDiscoverBody, MAX_PER_RUN, SEARCH_SUMMARY } from '@/lib/discoverOptions';
import { normaliseDomain } from '@/lib/domain';
import { db } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MAX_SHOWN = MAX_PER_RUN;

// Finds companies with Hunter Discover. Only suggests domains; the existing research pipeline decides fit.
export async function POST(req) {
  const input = await req.json().catch(() => ({}));
  // Fixed search from fit-rules.txt; nothing the browser sends can change it.
  const body = buildDiscoverBody();

  const h = await hunterDiscover(body);
  if (!h.ok) {
    return Response.json({ unavailable: true, error: `Hunter Discover unavailable: ${h.reason}. Paste a list below instead.` }, { status: 200 });
  }

  const raw = Array.isArray(h.data?.data) ? h.data.data : [];

  // Leave out companies researched in the last 30 days, unless the user asked to include them.
  let recent = new Set();
  if (!input?.includeResearched) {
    try {
      const since = new Date(Date.now() - 30 * 864e5).toISOString();
      const { data } = await db().from('runs').select('domain').gte('created_at', since).limit(5000);
      recent = new Set((data || []).map((r) => normaliseDomain(r.domain)).filter(Boolean));
    } catch {
      // if the database can't be read, show everything rather than fail
    }
  }

  const seen = new Set();
  const companies = [];
  let skipped = 0;
  for (const c of raw) {
    const domain = normaliseDomain(c?.domain);
    if (!domain || seen.has(domain)) continue;
    seen.add(domain);
    if (recent.has(domain)) {
      skipped++;
      continue;
    }
    if (companies.length < MAX_SHOWN) {
      companies.push({
        domain,
        name: String(c?.organization || '').trim() || domain,
        emails: Number(c?.emails_count?.total ?? 0) || 0,
        // Hunter's Discover reply does not include industry, headcount or location per company.
        industry: SEARCH_SUMMARY.industry,
        headcount: SEARCH_SUMMARY.headcount,
        location: null,
      });
    }
  }

  return Response.json({
    companies,
    total_matching: Number(h.data?.meta?.results ?? raw.length) || raw.length,
    returned: raw.length,
    skipped_researched: skipped,
    from_cache: !!h.from_cache,
    applied: h.data?.meta?.filters || null,
  });
}
