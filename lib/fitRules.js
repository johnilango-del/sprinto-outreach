import fs from 'node:fs';
import path from 'node:path';
import { FIT_RULES_EMBEDDED } from './fitRulesText.generated.js';

let cached = null;

// Reads fit-rules.txt at runtime (shipped to Vercel via outputFileTracingIncludes).
// Falls back to the copy embedded at build time, so the rulebook is never missing.
export function getFitRules() {
  if (cached) return cached;
  try {
    const text = fs.readFileSync(path.join(process.cwd(), 'fit-rules.txt'), 'utf8');
    if (text.trim()) {
      cached = { text, source: 'fit-rules.txt (read at runtime)' };
      return cached;
    }
  } catch {
    // fall through to the embedded copy
  }
  cached = { text: FIT_RULES_EMBEDDED, source: 'fit-rules.txt (embedded copy from build)' };
  return cached;
}
