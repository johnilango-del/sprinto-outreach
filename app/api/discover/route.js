import { hunterDiscover, getDiscoverState, saveDiscoverState } from '@/lib/hunter';
import {
  buildDiscoverBody,
  MAX_PER_RUN,
  PAGE_SIZE,
  MIN_EMAILS,
  MAX_EMAILS,
  LARGE_COMPANY_DOMAINS,
  LARGE_COMPANY_NAMES,
} from '@/lib/discoverOptions';
import { normaliseDomain } from '@/lib/domain';
import { db } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MAX_OFFSET = 10000; // Hunter's documented maximum

function isLargeCompany(domain, name) {
  const d = String(domain || '').toLowerCase();
  if (LARGE_COMPANY_DOMAINS.some((x) => d === x || d.endsWith('.' + x))) return true;
  const n = String(name || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  return LARGE_COMPANY_NAMES.includes(n); // exact name only, so a small "Zoom Analytics" isn't caught by "zoom"
}

// Finds companies with Hunter Discover (fixed search from fit-rules.txt). Only suggests domains;
// the existing research pipeline decides fit.
export async function POST() {
  // 1. Which page of results to ask for (rotation). Paging is a paid Hunter feature.
  const state = await getDiscoverState();
  let offset = state.paging ? state.offset : 0;
  let paging = state.paging;

  let h = await hunterDiscover(buildDiscoverBody(offset));
  if (!h.ok && h.id === 'pagination_error' && offset > 0) {
    // This plan can't page: remember that and use the first page (rotation then comes from skipping researched companies).
    paging = false;
    offset = 0;
    h = await hunterDiscover(buildDiscoverBody(0));
  }
  if (!h.ok) {
    return Response.json({ unavailable: true, error: `Hunter Discover unavailable: ${h.reason}. Paste a list below instead.` }, { status: 200 });
  }

  const raw = Array.isArray(h.data?.data) ? h.data.data : [];
  const totalMatching = Number(h.data?.meta?.results ?? raw.length) || raw.length;
  const applied = h.data?.meta?.filters || null;
  const headcountApplied = !!(applied && applied.headcount && (Array.isArray(applied.headcount) ? applied.headcount.length : true));

  // Next click asks for the next page (if paging works), wrapping round at the end.
  let nextOffset = 0;
  if (paging) {
    const candidate = offset + PAGE_SIZE;
    nextOffset = raw.length >= PAGE_SIZE && candidate < Math.min(totalMatching, MAX_OFFSET) ? candidate : 0;
  }
  await saveDiscoverState({ offset: nextOffset, paging });

  // 2. Skip companies researched in the last 30 days.
  let recent = new Set();
  try {
    const since = new Date(Date.now() - 30 * 864e5).toISOString();
    const { data } = await db().from('runs').select('domain').gte('created_at', since).limit(5000);
    recent = new Set((data || []).map((r) => normaliseDomain(r.domain)).filter(Boolean));
  } catch {
    // if the database can't be read, carry on without this filter
  }

  // 3. Size safety net in code: 5-300 known emails, not on the large-company list. Smallest first.
  const seen = new Set();
  const kept = [];
  let droppedLarge = 0;
  let droppedTiny = 0;
  let skipped = 0;
  for (const c of raw) {
    const domain = normaliseDomain(c?.domain);
    if (!domain || seen.has(domain)) continue;
    seen.add(domain);
    const name = String(c?.organization || '').trim() || domain;
    const emails = Number(c?.emails_count?.total ?? 0) || 0;
    if (isLargeCompany(domain, name) || emails > MAX_EMAILS) {
      droppedLarge++;
      continue;
    }
    if (emails < MIN_EMAILS) {
      droppedTiny++;
      continue;
    }
    if (recent.has(domain)) {
      skipped++;
      continue;
    }
    kept.push({ domain, name, emails });
  }
  kept.sort((a, b) => a.emails - b.emails);
  const companies = kept.slice(0, MAX_PER_RUN);

  console.log(
    `[discover] offset ${offset} (paging ${paging ? 'on' : 'off'}): ${raw.length} returned, ${droppedLarge} too large, ${droppedTiny} too small, ${skipped} researched recently, ${companies.length} kept`
  );

  return Response.json({
    companies,
    total_matching: totalMatching,
    returned: raw.length,
    dropped_large: droppedLarge,
    dropped_small: droppedTiny,
    skipped_researched: skipped,
    from_cache: !!h.from_cache,
    offset,
    paging,
    headcount_applied: headcountApplied,
  });
}
