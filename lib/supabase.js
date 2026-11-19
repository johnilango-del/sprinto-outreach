import { createClient } from '@supabase/supabase-js';
import { env } from './config.js';

let client = null;

// Server-only Supabase client using the SECRET key.
export function db() {
  if (client) return client;
  const url = env('SUPABASE_URL');
  const key = env('SUPABASE_SECRET_KEY');
  if (!url || !key) {
    throw new Error('Supabase is not set up: add SUPABASE_URL and SUPABASE_SECRET_KEY in Vercel, then redeploy.');
  }
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

// Turns a Supabase error into a plain sentence.
export function dbError(error, what) {
  const msg = error?.message || String(error);
  if (/relation .* does not exist|Could not find the table|schema cache/i.test(msg)) {
    return `${what}: the database tables are missing or out of date. Paste supabase/schema.sql into the Supabase SQL Editor and run it.`;
  }
  return `${what}: ${msg}`;
}
