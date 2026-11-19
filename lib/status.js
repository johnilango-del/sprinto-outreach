// STATUS IN CODE, exactly per fit-rules.txt:
// disqualifiers first (Step 1), then must-haves (Step 2), then pressure points, then the stage test.

import { pathLabel } from './domain.js';

export const STATUS_LABELS = {
  GOOD_FIT: 'Good fit',
  GOOD_FIT_FLAGGED: 'Good fit, flagged',
  NOT_A_FIT: 'Not a fit',
  NEEDS_REVIEW: 'Needs review',
  NO_CONTACT: 'No contact',
  ERROR: 'Error',
};

const DQ_LABELS = {
  not_software: 'Not a software company',
  consumer_only: 'Sells only to consumers',
  too_big: 'Too big',
  no_product: 'No real product yet',
};

export const POINTS = { strong: 2, medium: 1 };

export function addUpPoints(signals) {
  return signals.reduce((sum, s) => sum + (POINTS[s.strength] || 0), 0);
}

function q(s, n = 140) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

// state: { cert, fields, signals, disqualifiers, pagesChecked }
// Returns { status, reason, flags: [] }
export function decideStatus(state) {
  const { cert, fields, signals, disqualifiers, pagesChecked } = state;
  const flags = [];
  const pagesNote = `${pagesChecked} page${pagesChecked === 1 ? '' : 's'}`;

  // Step 1, rule 3: already certified (decided by code on raw text)
  if (cert.status === 'certified') {
    const m = cert.achieved[0];
    return {
      status: 'NOT_A_FIT',
      reason: `Already certified: the site says "${q(m.quote)}" (${pathLabel(m.source_url)}). This campaign pitches the first certification.`,
      flags,
    };
  }

  // Step 1, rules 1, 2, 4, 5 (facts filled by AI, quotes verified by code)
  if (disqualifiers.length) {
    const d = disqualifiers[0];
    return {
      status: 'NOT_A_FIT',
      reason: `${DQ_LABELS[d.rule] || 'Disqualified'}: "${q(d.quote)}" (${pathLabel(d.source_url)}).`,
      flags,
    };
  }

  // Step 2A: B2B SaaS
  if (fields.b2b_saas.value === 'no') {
    return {
      status: 'NOT_A_FIT',
      reason: `Not B2B software: "${q(fields.b2b_saas.quote)}" (${pathLabel(fields.b2b_saas.source_url)}).`,
      flags,
    };
  }
  if (!fields.b2b_saas.value) {
    return {
      status: 'NEEDS_REVIEW',
      reason: `Could not confirm it sells software to businesses after checking ${pagesNote}. A human should look.`,
      flags,
    };
  }

  // Step 2B: handles data
  if (fields.handles_data.value === 'no') {
    return {
      status: 'NOT_A_FIT',
      reason: `Doesn't handle customer data: "${q(fields.handles_data.quote)}" (${pathLabel(fields.handles_data.source_url)}).`,
      flags,
    };
  }

  // Step 3: pressure points
  const points = addUpPoints(signals);
  if (points === 0) {
    return {
      status: 'NOT_A_FIT',
      reason: `No pressure signals: 0 points after checking ${pagesNote}.`,
      flags,
    };
  }

  // Anything unconfirmed after the page limit = GOOD FIT, FLAGGED
  const unconfirmed = [];
  if (!fields.handles_data.value) {
    unconfirmed.push('data handling assumed');
    flags.push('data handling not stated on the site; assumed yes for a software company');
  }
  if (points === 1) unconfirmed.push('only 1 pressure point');
  if (!fields.stage.value) {
    unconfirmed.push('stage unknown');
    flags.push('stage not found on the site');
  }
  if (cert.status !== 'in_progress' && !fields.certified.value) {
    unconfirmed.push('certification status unknown');
    flags.push('certification status not confirmed; treated as not certified');
  }

  const signalNames = signals.map((s) => `${s.signal} (${s.strength})`).join(', ');
  if (unconfirmed.length) {
    return {
      status: 'GOOD_FIT_FLAGGED',
      reason: `Qualifies with ${points} point${points === 1 ? '' : 's'} (${signalNames}), but unconfirmed: ${unconfirmed.join(', ')}.`,
      flags,
    };
  }
  return {
    status: 'GOOD_FIT',
    reason: `B2B SaaS that handles customer data, not yet certified, ${points} pressure points (${signalNames}), stage: ${fields.stage.value}.`,
    flags,
  };
}
