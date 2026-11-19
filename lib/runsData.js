import { db, dbError } from './supabase.js';

// Loads all runs (newest first). Returns { runs, error }.
export async function loadRuns(columns = '*') {
  try {
    const { data, error } = await db().from('runs').select(columns).order('created_at', { ascending: false }).limit(2000);
    if (error) return { runs: [], error: dbError(error, 'Could not load results') };
    return { runs: data || [], error: null };
  } catch (e) {
    return { runs: [], error: e.message };
  }
}

// One row per company: the latest run for each domain.
export function latestPerDomain(runs) {
  const seen = new Map();
  for (const r of runs) {
    if (!seen.has(r.domain)) seen.set(r.domain, { ...r, earlier_runs: 0 });
    else seen.get(r.domain).earlier_runs++;
  }
  return [...seen.values()];
}
