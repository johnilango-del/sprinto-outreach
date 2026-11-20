// Turns a saved run into clearly separated pieces for the screen:
// a short verdict, "Action needed" items, "Warnings", the "Why" bullets and the contact line.
// Pure function: used by the server pages and sent to the Run page when a company finishes.

const STATUS_WORDS = {
  GOOD_FIT: 'Good fit',
  GOOD_FIT_FLAGGED: 'Good fit, flagged',
  NOT_A_FIT: 'Not a fit',
  NEEDS_REVIEW: 'Needs review',
  NO_CONTACT: 'No contact',
  ERROR: 'Error',
};

export const SOURCE_TAGS = {
  hunter: 'Found by Hunter',
  team_page_hunter: 'Team page + Hunter',
  apollo_list: 'Backup list',
};

function capWords(s, max = 16) {
  const words = String(s || '').replace(/\s+/g, ' ').trim().split(' ');
  if (words.length <= max) return words.join(' ');
  return words.slice(0, max).join(' ').replace(/[,;:]$/, '') + '…';
}

function shortSignal(sig) {
  const t = String(sig || '').replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
  return capWords(t, 7).replace(/…$/, '');
}

function lowerFirst(s) {
  // keep acronyms like "SOC 2" or "ISO 27001" as they are
  if (!s || /^[A-Z0-9]{2}/.test(s)) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function pagePath(url) {
  try {
    const u = new URL(url);
    return u.pathname === '/' ? 'homepage' : u.pathname;
  } catch {
    return '';
  }
}

const NOT_FIT_WORDS = {
  'already certified': 'already SOC 2 / ISO 27001 certified',
  'no pressure signals': 'no pressure signals found on the site',
  'not a software company': 'not a software company',
  'sells only to consumers': 'sells only to consumers',
  'too big': 'too big for Sprinto’s sweet spot',
  'no real product yet': 'no real product yet',
  'not b2b software': 'not B2B software',
  "doesn't handle customer data": "doesn't handle customer data",
};

function verdictFor(r, signals, flags) {
  const s = r.status;
  const reason = String(r.status_reason || '');
  if (s === 'GOOD_FIT' || s === 'GOOD_FIT_FLAGGED') {
    const top = signals.slice(0, 2).map((x) => lowerFirst(shortSignal(x.signal)));
    const because = top.length ? top.join(' and ') : `${r.pressure_points || 0} pressure points`;
    if (s === 'GOOD_FIT') return capWords(`Good fit: ${because}.`);
    const open = [];
    if (flags.some((f) => /^stage not found/.test(f))) open.push('stage unconfirmed');
    if ((r.pressure_points || 0) === 1) open.push('only 1 point');
    if (flags.some((f) => /^data handling not stated/.test(f))) open.push('data handling assumed');
    if (flags.some((f) => /^certification status not confirmed/.test(f))) open.push('certification unconfirmed');
    return capWords(`Good fit, flagged: ${top[0] || because}${open.length ? '; ' + open.slice(0, 2).join(', ') : ''}.`);
  }
  if (s === 'NOT_A_FIT') {
    const cat = reason.split(':')[0].trim().toLowerCase();
    return capWords(`Not a fit: ${NOT_FIT_WORDS[cat] || cat || 'fails the fit rules'}.`);
  }
  if (s === 'NEEDS_REVIEW') {
    return /robots/i.test(reason)
      ? 'Needs review: the homepage is blocked by robots.txt.'
      : 'Needs review: couldn’t confirm it sells software to businesses.';
  }
  if (s === 'NO_CONTACT') return 'Qualifies, but no suitable contact was found.';
  return capWords(`Error: ${reason || 'the run failed'}`, 14);
}

function shortSource(src) {
  const t = String(src || '');
  if (/^hunter/i.test(t)) return 'Hunter list';
  if (/^team page/i.test(t)) return 'team page';
  if (/^backup/i.test(t)) return 'backup list';
  return lowerFirst(t);
}

function shortResult(res) {
  const t = String(res || '');
  if (/^found|Email Finder found/i.test(t)) return 'found';
  if (/none in the ranking/i.test(t)) return 'none suitable';
  if (/no names found/i.test(t)) return 'no names';
  if (/no people listed/i.test(t)) return 'nobody listed';
  if (/unavailable/i.test(t)) return 'unavailable';
  if (/skipped/i.test(t)) return 'skipped';
  if (/no email with/i.test(t)) return 'no confident email';
  if (/no entry/i.test(t)) return 'no entry';
  if (/could not list/i.test(t)) return 'AI error';
  return capWords(t, 5);
}

function actionsFor(r, flags) {
  const s = r.status;
  const reason = String(r.status_reason || '');
  const out = [];
  if (s === 'NO_CONTACT') {
    const tried = Array.isArray(r.contact_attempts) ? r.contact_attempts : [];
    out.push(
      tried.length
        ? `No contact found. Tried: ${tried.map((a) => `${shortSource(a.source)} (${shortResult(a.result)})`).join(', ')}.`
        : 'No contact found by any source.'
    );
    out.push('Optional: add a person on Backup contacts, then re-run this company.');
  } else if (s === 'NEEDS_REVIEW') {
    out.push(/robots/i.test(reason) ? 'Open the site yourself: robots.txt blocked the homepage.' : 'Open the site and decide whether it sells software to businesses.');
    out.push('Then mark Agree or Disagree on the Why card.');
  } else if (s === 'ERROR') {
    out.push(/missing settings|not set up|is not set/i.test(reason) ? 'Add the missing settings in Vercel, then redeploy.' : 'Run this company again.');
    out.push(`Error: ${capWords(reason, 20)}`);
  } else if (s === 'GOOD_FIT' || s === 'GOOD_FIT_FLAGGED') {
    if (!r.email_original) {
      if (flags.some((f) => /out of time|email not written/i.test(f))) out.push('Run this company again to write the email (pages are cached).');
    } else if (r.email_status === 'draft' || !r.email_status) {
      if (flags.some((f) => /claim not found on the site/.test(f))) out.push('Check or remove the highlighted claim in the email before sending.');
      if (flags.some((f) => /email domain doesn't match/.test(f))) out.push('Verify the contact’s email address before any real send.');
      out.push('Review the draft email, then click Send to my inbox or Skip.');
    }
  }
  return out;
}

function warningText(f) {
  const t = String(f || '');
  if (/^AI quote not found on page/.test(t)) return 'The AI cited text that isn’t on the site; it was removed.';
  if (/^page may need a real browser/.test(t)) return 'A page had very little readable text; it may need a real browser.';
  if (/claim not found on the site/.test(t)) return 'The email uses a claim not found on the site (highlighted in the email).';
  if (/^email domain doesn't match/.test(t)) return 'The contact’s email domain doesn’t match the company; verify before a real send.';
  if (/^contact title may not (be the buyer|fit)/.test(t)) return `Contact’s title may not be the right buyer: ${t.split(':').slice(1).join(':').trim()}`;
  if (/^stage not found/.test(t)) return 'Company stage not confirmed on the site.';
  if (/^data handling not stated/.test(t)) return 'Data handling isn’t stated on the site; assumed yes.';
  if (/^certification status not confirmed/.test(t)) return 'Certification status not confirmed; treated as not certified.';
  if (/^time limit reached/.test(t)) return 'Time limit reached before every extra page was checked.';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function presentRun(r) {
  const fields = r.fields || {};
  const signals = Array.isArray(fields.pressure_signals) ? fields.pressure_signals : [];
  const flags = Array.isArray(r.flags) ? r.flags : [];
  const isNotFit = ['NOT_A_FIT', 'NEEDS_REVIEW', 'ERROR'].includes(r.status);
  return {
    status: r.status,
    status_label: STATUS_WORDS[r.status] || r.status,
    origin: fields.domain_source || null,
    origin_tag: fields.domain_source === 'discovered' ? 'Found by Discover' : fields.domain_source === 'pasted' ? 'Pasted' : null,
    verdict: verdictFor(r, signals, flags),
    actions: actionsFor(r, flags),
    warnings: [...new Set(flags.map(warningText))],
    why: {
      points: r.pressure_points || 0,
      signals: signals.map((x) => ({
        signal: x.signal,
        strength: x.strength,
        points: x.strength === 'strong' ? 2 : 1,
        page: pagePath(x.source_url),
      })),
      rule: isNotFit ? String(r.status_reason || '') : '',
      full_reason: String(r.status_reason || ''),
    },
    contact: r.contact_name
      ? {
          name: r.contact_name,
          title: r.contact_title || '',
          source: r.contact_source,
          source_tag: SOURCE_TAGS[r.contact_source] || 'Contact',
          pick_reason: r.pick_reason || '',
        }
      : null,
  };
}
