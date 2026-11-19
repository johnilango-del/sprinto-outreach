// The research pipeline for ONE company. The AI fills fact fields; this code decides everything else.

import { db, dbError } from './supabase.js';
import { createFetcher } from './fetcher.js';
import { normaliseDomain, hostBase, sameSite, pathLabel } from './domain.js';
import { certVerdict, classifyQuote } from './certCheck.js';
import { makeVerifier } from './verify.js';
import { callGemini } from './gemini.js';
import { extractionPrompt, writingPrompt } from './prompts.js';
import { decideStatus, addUpPoints, STATUS_LABELS } from './status.js';
import { matchContacts, codeTitleCheck, domainCheck, isGenericInbox } from './contacts.js';
import { norm, wordCount } from './text.js';
import { missingEnv } from './config.js';
import { hunterEnabled, hunterDomainSearch, pickFromHunter } from './hunter.js';

// Time budget inside Vercel's 60-second limit.
const LOOP_STOP_S = 30; // no new extra page after this
const WRITE_STOP_S = 45; // no writing call after this
const HARD_LIMIT_S = 56; // every AI call must finish before this

const MAX_EXTRA_PAGES = 4;

export const FLAG_THIN = 'page may need a real browser; content was thin';
export const FLAG_QUOTE = 'AI quote not found on page: removed';
export const FLAG_CLAIM = 'email contains a claim not found on the site';
export const FLAG_DOMAIN = "email domain doesn't match the company; verify before a real send";

const CERT_WORDS_RE = /\bSOC\s?-?\s?2\b|\bISO\s*\/?\s*(?:IEC\s*)?27001\b/i;

// WHERE TO LOOK, in order. /about only if linked from a fetched page.
const EXTRA_PAGES = [
  { key: 'careers', paths: ['/careers', '/jobs'], re: /(^|\/)(careers?|jobs|join-us|join|work-with-us|hiring|open-positions|open-roles)(\/|$)/i, answers: ['stage', 'pressure'] },
  { key: 'pricing', paths: ['/pricing', '/plans'], re: /(^|\/)(pricing|plans|plans-and-pricing)(\/|$)/i, answers: ['stage', 'pressure', 'b2b'] },
  { key: 'security', paths: ['/security', '/trust'], re: /(^|\/)(security|trust|trust-center|trust-centre|trustcenter)(\/|$)/i, answers: ['certified', 'pressure'] },
  { key: 'customers', paths: ['/customers', '/case-studies'], re: /(^|\/)(customers|case-studies|case-study|success-stories|customer-stories)(\/|$)/i, answers: ['b2b', 'pressure'] },
  { key: 'about', paths: [], re: /(^|\/)(about|about-us)(\/|$)/i, answers: ['stage', 'b2b'] },
];

const EMPTY = () => ({ value: '', quote: '', source_url: '' });

export async function runCompany(input, emit = () => {}) {
  const t0 = Date.now();
  const elapsed = () => (Date.now() - t0) / 1000;
  const stepLog = [];
  const flags = [];
  const pagesFetched = [];
  const addFlag = (f) => {
    if (f && !flags.includes(f)) flags.push(f);
  };
  let currentStep = null;
  const step = (stepKey, state, note = '') => {
    if (state === 'running') currentStep = stepKey;
    stepLog.push({ t: Math.round(elapsed() * 10) / 10, step: stepKey, state, note });
    emit({ type: 'step', step: stepKey, state, note });
  };
  const logNote = (note) => {
    stepLog.push({ t: Math.round(elapsed() * 10) / 10, step: currentStep || 'info', state: 'note', note });
    emit({ type: 'note', note });
  };

  const run = {
    domain: normaliseDomain(input) || String(input || '').trim().slice(0, 200),
    company_name: null,
    status: 'ERROR',
    status_reason: '',
    fields: {},
    pressure_points: 0,
    contact_id: null,
    contact_source: null,
    contact_name: null,
    contact_title: null,
    contact_email: null,
    contact_confidence: null,
    pick_reason: null,
    contact_check: null,
    pain_points: null,
    email_subject: null,
    email_original: null,
    email_final: null,
    email_status: null,
    facts_used: null,
  };

  try {
    const missing = missingEnv(['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'GEMINI_API_KEY']);
    if (missing.length) throw new Error(`Missing settings in Vercel: ${missing.join(', ')}.`);

    const domain = normaliseDomain(input);
    if (!domain) throw new Error(`"${String(input).slice(0, 80)}" does not look like a website address.`);
    run.domain = domain;

    const fetcher = createFetcher();
    const pages = []; // successfully read pages
    const triedUrls = new Set();

    const recordFetch = (pg, kind, via) => {
      const entry = {
        url: pg.url,
        page: pathLabel(pg.final_url || pg.url),
        kind,
        found_via: via,
        from_cache: !!pg.from_cache,
        http_status: pg.http_status ?? null,
        words: pg.word_count ?? null,
        result: pg.blocked ? 'blocked by robots.txt' : pg.error ? pg.error : 'read',
        answered: [],
      };
      pagesFetched.push(entry);
      return entry;
    };

    // ---------- 1-2. Homepage ----------
    step('site', 'running', 'reading site');
    let home = null;
    for (const url of [`https://${domain}/`, `https://www.${domain}/`]) {
      triedUrls.add(url);
      const pg = await fetcher.getPage(url);
      const entry = recordFetch(pg, 'homepage', 'start');
      if (pg.blocked) {
        logNote(`${url} blocked by robots.txt`);
        home = pg;
        break;
      }
      if (pg.raw_text || pg.clean_text) {
        home = pg;
        entry.answered.push('homepage read');
        break;
      }
      logNote(`${url}: ${pg.error || 'no text'}`);
    }
    if (!home || home.blocked) {
      if (home?.blocked) {
        step('site', 'flag', 'blocked by robots.txt');
        run.status = 'NEEDS_REVIEW';
        run.status_reason = 'The homepage is blocked by robots.txt, so the site was not read. A human should look.';
        addFlag('blocked by robots.txt');
        return await finish();
      }
      const last = pagesFetched[pagesFetched.length - 1];
      throw new Error(`Could not read the homepage (${last?.result || 'unknown error'}).`);
    }
    pages.push(home);
    if ((home.word_count ?? 0) < 150) {
      addFlag(FLAG_THIN);
      step('site', 'flag', `homepage read (${home.word_count || 0} words; thin)${home.from_cache ? ' from cache' : ''}`);
    } else {
      step('site', 'done', `homepage read (${home.word_count} words)${home.from_cache ? ' from cache' : ''}`);
    }
    const origin = new URL(home.final_url || home.url).origin;
    const siteHosts = [domain, hostBase(new URL(origin).host)].filter((v, i, a) => a.indexOf(v) === i);

    // ---------- shared state ----------
    let ext = null; // last processed extraction
    let state = null;
    let securityPage = null;

    const runCertCheck = () => certVerdict(pages);

    const certSummary = (cert) => {
      if (!cert.all.length) return 'No SOC 2 / ISO 27001 mention found in the raw text of the pages.';
      return cert.all
        .map((m) => `- ${m.cert}: ${m.type.replace('_', ' ')} | "${m.quote}" (${m.source_url})`)
        .join('\n');
    };

    const processExtraction = (ai, verify) => {
      const dropped = [];
      const vField = (f, name) => {
        if (!f || typeof f !== 'object') return EMPTY();
        const value = String(f.value ?? '').trim();
        if (!value) return EMPTY();
        const url = verify(f.quote, f.source_url);
        if (!url) {
          dropped.push(`${name}: "${String(f.quote || '').slice(0, 120)}"`);
          return EMPTY();
        }
        return { value, quote: String(f.quote).trim(), source_url: url };
      };
      const out = {
        company_name: String(ai?.company_name || '').trim().slice(0, 120),
        certified: vField(ai?.certified, 'certified'),
        b2b_saas: vField(ai?.b2b_saas, 'b2b_saas'),
        handles_data: vField(ai?.handles_data, 'handles_data'),
        stage: vField(ai?.stage, 'stage'),
        signals: [],
        disqualifiers: [],
      };
      for (const k of ['b2b_saas', 'handles_data']) {
        if (out[k].value && !['yes', 'no'].includes(out[k].value.toLowerCase())) out[k] = EMPTY();
        else if (out[k].value) out[k].value = out[k].value.toLowerCase();
      }
      for (const s of Array.isArray(ai?.pressure_signals) ? ai.pressure_signals : []) {
        if (!s || !s.quote) continue;
        const url = verify(s.quote, s.source_url);
        if (!url) {
          dropped.push(`signal "${s.signal}": "${String(s.quote).slice(0, 120)}"`);
          continue;
        }
        out.signals.push({
          signal: String(s.signal || 'signal').slice(0, 120),
          strength: s.strength === 'strong' ? 'strong' : 'medium',
          quote: String(s.quote).trim(),
          source_url: url,
          by: 'ai',
        });
      }
      const allowed = ['not_software', 'consumer_only', 'too_big', 'no_product'];
      for (const d of Array.isArray(ai?.disqualifiers) ? ai.disqualifiers : []) {
        if (!d || !allowed.includes(d.rule) || !d.quote) continue;
        const url = verify(d.quote, d.source_url);
        if (!url) {
          dropped.push(`disqualifier ${d.rule}: "${String(d.quote).slice(0, 120)}"`);
          continue;
        }
        out.disqualifiers.push({ rule: d.rule, reason: String(d.reason || '').slice(0, 200), quote: String(d.quote).trim(), source_url: url });
      }
      if (dropped.length) {
        addFlag(FLAG_QUOTE);
        for (const d of dropped) logNote(`quote removed (not found on page): ${d}`);
      }
      return out;
    };

    // Combines code's certification scan with the verified AI fields into one state.
    const buildState = () => {
      const cert = runCertCheck();
      // AI certification answer is only a second opinion; code's nearby-words rule decides.
      if (ext?.certified?.value && (cert.status === 'none' || cert.status === 'ambiguous')) {
        const cls = classifyQuote(ext.certified.quote);
        const m = { cert: /iso/i.test(ext.certified.quote) ? 'ISO 27001' : 'SOC 2', quote: ext.certified.quote, source_url: ext.certified.source_url };
        if (cls === 'achieved' && ext.certified.value === 'achieved') {
          cert.achieved.push({ ...m, type: 'achieved' });
          cert.status = 'certified';
        } else if (cls === 'in_progress') {
          cert.inProgress.push({ ...m, type: 'in_progress' });
          cert.status = 'in_progress';
        } else {
          cert.ambiguous.push({ ...m, type: 'ambiguous' });
          cert.status = 'ambiguous';
        }
      }
      let certified = EMPTY();
      if (cert.status === 'certified') {
        certified = { value: 'achieved', quote: cert.achieved[0].quote, source_url: cert.achieved[0].source_url };
      } else if (cert.status === 'in_progress') {
        certified = { value: 'not certified (in progress)', quote: cert.inProgress[0].quote, source_url: cert.inProgress[0].source_url };
      } else if (cert.status === 'none' && securityPage) {
        certified = { value: 'not certified (security page names no certification)', quote: '', source_url: securityPage.url };
      }

      // Pressure signals: code's in-progress finding counts once as STRONG; AI signals about the same thing are merged.
      let signals = [];
      if (cert.status === 'in_progress') {
        const m = cert.inProgress[0];
        signals.push({ signal: `${m.cert} certification in progress / planned`, strength: 'strong', quote: m.quote, source_url: m.source_url, by: 'code' });
      }
      const seenQuotes = new Set(signals.map((s) => norm(s.quote)));
      const seenNames = new Set(signals.map((s) => norm(s.signal)));
      for (const s of ext?.signals || []) {
        if (cert.status === 'in_progress' && CERT_WORDS_RE.test(s.quote) && s.strength === 'strong') continue;
        const qk = norm(s.quote);
        const nk = norm(s.signal);
        if (seenQuotes.has(qk) || seenNames.has(nk)) continue;
        seenQuotes.add(qk);
        seenNames.add(nk);
        signals.push(s);
      }

      return {
        cert,
        fields: {
          certified,
          b2b_saas: ext?.b2b_saas || EMPTY(),
          handles_data: ext?.handles_data || EMPTY(),
          stage: ext?.stage || EMPTY(),
        },
        signals,
        disqualifiers: ext?.disqualifiers || [],
        pagesChecked: pages.length,
      };
    };

    const unanswered = (st) => {
      const need = new Set();
      if (!st.fields.b2b_saas.value) need.add('b2b');
      if (!st.fields.stage.value) need.add('stage');
      if (addUpPoints(st.signals) < 2) need.add('pressure');
      if (!st.fields.certified.value && st.cert.status !== 'certified') need.add('certified');
      return need;
    };

    const endsEverything = (st) =>
      st.cert.status === 'certified' || st.disqualifiers.length > 0 || st.fields.b2b_saas.value === 'no';

    const runExtraction = async () => {
      const verify = makeVerifier(pages);
      const cert = runCertCheck();
      const { system, user } = extractionPrompt({ domain, pages, certSummary: certSummary(cert) });
      const timeoutMs = Math.min(25000, (HARD_LIMIT_S - elapsed()) * 1000 - 2000);
      if (timeoutMs < 6000) throw new Error('Not enough time left for the AI extraction.');
      const ai = await callGemini({ system, user, timeoutMs });
      return processExtraction(ai, verify);
    };

    const describeAnswered = (before, after, pageUrl) => {
      const got = [];
      if (!before || (!before.fields.b2b_saas.value && after.fields.b2b_saas.value)) if (after.fields.b2b_saas.value) got.push(`b2b_saas: ${after.fields.b2b_saas.value}`);
      if (!before || (!before.fields.handles_data.value && after.fields.handles_data.value)) if (after.fields.handles_data.value) got.push(`handles_data: ${after.fields.handles_data.value}`);
      if (!before || (!before.fields.stage.value && after.fields.stage.value)) if (after.fields.stage.value) got.push(`stage: ${after.fields.stage.value}`);
      if (!before || (!before.fields.certified.value && after.fields.certified.value)) if (after.fields.certified.value) got.push(`certified: ${after.fields.certified.value}`);
      for (const s of after.signals) if (s.source_url === pageUrl) got.push(`signal: ${s.signal} (${s.strength})`);
      for (const d of after.disqualifiers) if (d.source_url === pageUrl) got.push(`disqualifier: ${d.rule}`);
      return got.length ? got : ['nothing new'];
    };

    // ---------- 3. Certification check (code, raw text) ----------
    step('cert', 'running', 'checking certification');
    let cert0 = runCertCheck();
    if (cert0.status === 'certified') {
      step('cert', 'done', 'already certified');
    } else if (cert0.status === 'ambiguous') {
      step('cert', 'flag', 'mention found, status unclear');
    } else {
      step('cert', 'done', cert0.status === 'in_progress' ? 'in progress: strong signal' : 'none named on homepage');
    }

    if (cert0.status === 'certified') {
      state = buildState();
      return await decideAndFinish({ skipFacts: true });
    }

    // ---------- 4-6. Extraction + quote check ----------
    step('facts', 'running', 'extracting facts');
    ext = await runExtraction();
    run.company_name = ext.company_name || home.title || null;
    state = buildState();
    pagesFetched[pagesFetched.length - 1].answered = describeAnswered(null, state, home.url);
    step('facts', flags.includes(FLAG_QUOTE) ? 'flag' : 'done', `${state.signals.length} signal(s), ${addUpPoints(state.signals)} point(s)`);

    // ---------- 7. Agent loop (code decides whether to fetch another page) ----------
    let extraCount = 0;
    const tried = new Set();
    const allLinks = () => pages.flatMap((p) => (Array.isArray(p.links) ? p.links : []));
    const findLink = (cat) => {
      const cands = [];
      const linkPool = cat.key === 'about' ? allLinks() : (Array.isArray(home.links) ? home.links : []);
      for (const l of linkPool) {
        let u;
        try {
          u = new URL(l.href);
        } catch {
          continue;
        }
        if (!sameSite(u.host, domain) && !siteHosts.includes(hostBase(u.host))) continue;
        if (/\.(pdf|png|jpe?g|gif|zip|svg|webp|mp4)$/i.test(u.pathname)) continue;
        const path = u.pathname.replace(/\/+$/, '') || '/';
        const sub = cat.key === 'security' && /^(trust|security)\./i.test(hostBase(u.host));
        if (cat.re.test(path) || sub) {
          u.hash = '';
          cands.push({ url: u.toString(), score: path.split('/').length * 1000 + path.length });
        }
      }
      cands.sort((a, b) => a.score - b.score);
      return cands.find((c) => !triedUrls.has(c.url))?.url || null;
    };

    let loopRan = false;
    while (extraCount < MAX_EXTRA_PAGES) {
      if (endsEverything(state)) break;
      const need = unanswered(state);
      if (need.size === 0) break;
      if (elapsed() > LOOP_STOP_S) {
        addFlag('time limit reached; stopped fetching extra pages');
        logNote('time budget reached; no more extra pages');
        break;
      }
      const cat = EXTRA_PAGES.find(
        (c) => !tried.has(c.key) && c.answers.some((a) => need.has(a)) && (c.key !== 'about' || findLink(c))
      );
      if (!cat) break;
      tried.add(cat.key);
      loopRan = true;

      const linked = findLink(cat);
      const urls = linked ? [linked] : cat.paths.map((p) => origin + p);
      const via = linked ? 'link on the site' : 'guessed path';
      const why = [...need].filter((n) => cat.answers.includes(n)).join(', ');
      step('extra', 'running', `fetching ${pathLabel(urls[0])} (looking for: ${why})`);
      extraCount++;

      let got = null;
      let entry = null;
      for (const url of urls) {
        if (triedUrls.has(url)) continue;
        triedUrls.add(url);
        const pg = await fetcher.getPage(url);
        entry = recordFetch(pg, cat.key, via);
        if (pg.blocked) {
          logNote(`${pathLabel(url)} blocked by robots.txt`);
          continue;
        }
        if (pg.raw_text || pg.clean_text) {
          got = pg;
          break;
        }
        logNote(`${pathLabel(url)}: ${pg.error || 'no text'}`);
        if (elapsed() > LOOP_STOP_S) break;
      }
      if (!got) continue;

      pages.push(got);
      if (cat.key === 'security') securityPage = got;
      if ((got.word_count ?? 0) < 150) {
        addFlag(FLAG_THIN);
        logNote(`${pathLabel(got.url)} looks thin (${got.word_count || 0} words)`);
      }

      // Re-run steps 3-6 with the new page added.
      const before = state;
      step('cert', 'running', `re-checking certification with ${pathLabel(got.url)}`);
      const certNow = runCertCheck();
      step('cert', certNow.status === 'ambiguous' ? 'flag' : 'done', certNow.status === 'certified' ? 'already certified' : certNow.status.replace('_', ' '));
      if (certNow.status === 'certified') {
        state = buildState();
        entry.answered = ['certified: achieved'];
        break;
      }
      step('facts', 'running', `re-extracting with ${pages.length} pages`);
      try {
        ext = await runExtraction();
        if (ext.company_name) run.company_name = ext.company_name;
      } catch (e) {
        addFlag(`AI extraction failed after ${pathLabel(got.url)}; used the earlier answers`);
        logNote(`extraction error: ${e.message}`);
        state = buildState();
        entry.answered = ['not analysed (AI error)'];
        step('facts', 'flag', 'kept earlier answers');
        break;
      }
      state = buildState();
      entry.answered = describeAnswered(before, state, got.url);
      step('facts', flags.includes(FLAG_QUOTE) ? 'flag' : 'done', `${state.signals.length} signal(s), ${addUpPoints(state.signals)} point(s)`);
      step('extra', 'done', `${pathLabel(got.url)}: ${entry.answered.join('; ')}`);
    }
    if (!loopRan) step('extra', 'skip', 'not needed');
    else step('extra', 'done', `${extraCount} extra page(s) checked`);

    return await decideAndFinish({ skipFacts: false });

    // ---------- 8-12 ----------
    async function decideAndFinish({ skipFacts }) {
      if (skipFacts) {
        step('facts', 'skip', 'already certified');
        step('extra', 'skip', 'already certified');
      }
      step('status', 'running', 'setting status');
      // Ambiguous certification mentions are flagged only if nothing clearer was found on any page.
      if (state.cert.status === 'ambiguous') {
        for (const a of state.cert.ambiguous.slice(0, 2)) {
          addFlag(`certification mentioned without a clear status ("${a.quote.slice(0, 90)}" on ${pathLabel(a.source_url)}); check by hand`);
        }
      }
      const decision = decideStatus(state);
      for (const f of decision.flags) addFlag(f);
      run.status = decision.status;
      run.status_reason = decision.reason;
      run.fields = { ...state.fields, pressure_signals: state.signals, disqualifiers: state.disqualifiers };
      run.pressure_points = addUpPoints(state.signals);
      if (!run.company_name) run.company_name = home.title || domain;
      step('status', decision.status === 'GOOD_FIT_FLAGGED' ? 'flag' : 'done', STATUS_LABELS[decision.status]);

      if (decision.status !== 'GOOD_FIT' && decision.status !== 'GOOD_FIT_FLAGGED') {
        step('contact', 'skip', 'only for good fits');
        step('email', 'skip', 'only for good fits');
        return await finish();
      }

      // ---------- 9. Contact (code only): Hunter first, then the Apollo list, then NO_CONTACT ----------
      let contact = null; // { person_name, title, email, domains }
      let matchedBy = '';

      // Source 1: Hunter (automatic)
      if (hunterEnabled()) {
        step('contact', 'running', 'Searching Hunter…');
        const h = await hunterDomainSearch(domain);
        if (h.ok) {
          const stageValue = state.fields.stage.value;
          const smallCompany = !stageValue || /\b(pre-?seed|seed)\b/i.test(stageValue);
          const p = pickFromHunter(h.data, { smallCompany });
          logNote(
            `Hunter${h.from_cache ? ' (saved result, no credits used)' : ''}: ${p.considered} people listed, ${p.eligible} usable (confidence 70%+, a first name, a ranked role, not generic, not sales/marketing)`
          );
          if (p.pick) {
            contact = { person_name: p.pick.person_name, title: p.pick.title, email: p.pick.email, domains: [] };
            matchedBy = 'Hunter domain search';
            run.contact_source = 'hunter';
            run.contact_confidence = p.pick.confidence;
            run.pick_reason = p.note;
          } else {
            logNote('Hunter found nobody in the ranking; checking your Apollo list');
          }
        } else {
          logNote(`Hunter unavailable: ${h.reason}`);
        }
      } else {
        step('contact', 'running', 'Hunter skipped (no key)');
        logNote('Hunter skipped: no HUNTER_API_KEY set; checking your Apollo list');
      }

      // Source 2: the Growth Lead's Apollo list (backup)
      if (!contact) {
        step('contact', 'running', 'checking your Apollo list');
        const { data: contacts, error: cErr } = await db().from('contacts').select('*').order('created_at', { ascending: true });
        if (cErr) throw new Error(dbError(cErr, 'Could not read contacts'));
        const { matches, how } = matchContacts(contacts || [], siteHosts, run.company_name);
        if (matches.length) {
          const c = matches[0];
          if (matches.length > 1) addFlag(`${matches.length} contacts match this company; used the first one added (${c.person_name})`);
          contact = { person_name: c.person_name, title: c.title || '', email: c.email || '', domains: c.domains || [] };
          matchedBy = `Apollo list, by ${how}`;
          run.contact_id = c.id;
          run.contact_source = 'apollo_list';
          run.contact_confidence = null;
          run.pick_reason = `From your Apollo list: ${c.why_chosen || 'no reason noted'}`;
        }
      }

      if (!contact) {
        const fitLabel = STATUS_LABELS[decision.status];
        run.status = 'NO_CONTACT';
        run.status_reason = `Qualifies (${fitLabel}: ${decision.reason}) but neither Hunter nor your Apollo list has a suitable person for ${domain}. Look the company up on Apollo, add the person on the Contacts page, then run it again.`;
        step('contact', 'flag', 'no suitable person found');
        step('email', 'skip', 'no contact');
        return await finish();
      }
      run.contact_name = contact.person_name;
      run.contact_title = contact.title || null;
      run.contact_email = contact.email || null;

      // Same checks for both sources
      const companyDomains = [...new Set([...siteHosts, ...(contact.domains || []).map((d) => normaliseDomain(d)).filter(Boolean)])];
      const dc = domainCheck(contact.email, companyDomains);
      if (dc.domain_matches === 'no') addFlag(FLAG_DOMAIN);
      if (isGenericInbox(contact.email)) addFlag('contact email looks like a generic inbox (info@, hello@); the rulebook says never use one');
      const tc = codeTitleCheck(contact.title);
      run.contact_check = {
        matched_by: matchedBy,
        title_fits: tc.decided ? tc.title_fits : null,
        title_reason: tc.decided ? tc.reason : null,
        title_checked_by: tc.decided ? 'code' : 'ai',
        domain_matches: dc.domain_matches,
        email_domain: dc.email_domain,
        company_domains: companyDomains,
      };
      if (tc.decided && tc.title_fits === 'no') addFlag(`contact title may not be the buyer: ${tc.reason}`);
      step(
        'contact',
        tc.decided || dc.domain_matches === 'no' ? 'flag' : 'done',
        `${run.contact_source === 'hunter' ? 'Found by Hunter' : 'From your Apollo list'}: ${contact.person_name}${contact.title ? `, ${contact.title}` : ''}`
      );

      // ---------- 10. Writing call ----------
      if (elapsed() > WRITE_STOP_S) {
        addFlag('ran out of time before writing the email; run this company again (its pages are cached now)');
        step('email', 'flag', 'out of time; run again');
        return await finish();
      }
      step('email', 'running', 'writing email');
      const verify = makeVerifier(pages);
      let w;
      try {
        const { system, user } = writingPrompt({
          domain,
          companyName: run.company_name,
          status: decision.status,
          fields: state.fields,
          signals: state.signals,
          contact,
          titleCheckedByCode: tc.decided,
        });
        const timeoutMs = Math.min(25000, (HARD_LIMIT_S - elapsed()) * 1000 - 1500);
        if (timeoutMs < 6000) throw new Error('Not enough time left to write the email.');
        w = await callGemini({ system, user, timeoutMs });
      } catch (e) {
        addFlag(`email not written: ${e.message}`);
        step('email', 'flag', 'AI writing failed');
        return await finish();
      }

      if (!tc.decided) {
        const v = String(w?.title_fits?.value || '').toLowerCase() === 'no' ? 'no' : 'yes';
        run.contact_check.title_fits = v;
        run.contact_check.title_reason = String(w?.title_fits?.reason || '').slice(0, 300);
        if (v === 'no') addFlag(`contact title may not fit the company's size: ${run.contact_check.title_reason}`);
      }

      // pain points: each must link to a verified quote
      const pains = (Array.isArray(w?.pain_points) ? w.pain_points : []).slice(0, 2).map((p) => {
        const url = p?.quote ? verify(p.quote, p.source_url) : null;
        if (p?.quote && !url) addFlag(FLAG_QUOTE);
        return {
          pain: String(p?.pain || '').slice(0, 300),
          why: String(p?.why || '').slice(0, 300),
          signal: String(p?.signal || '').slice(0, 160),
          quote: url ? String(p.quote).trim() : '',
          source_url: url || '',
          verified: !!url,
        };
      });
      run.pain_points = pains;

      const subject = String(w?.email_subject || '').replace(/\s+/g, ' ').trim().slice(0, 200);
      const body = String(w?.email_body || '').replace(/\r\n/g, '\n').trim();
      if (!body) {
        addFlag('email not written: the AI returned an empty email');
        step('email', 'flag', 'empty email');
        return await finish();
      }
      run.email_subject = subject || `Quick question for ${run.company_name}`;
      run.email_original = body;
      run.email_final = body;
      run.email_status = 'draft';

      // ---------- 11. Claims check (code) ----------
      const facts = (Array.isArray(w?.facts_used) ? w.facts_used : []).map((f) => String(f || '').trim()).filter(Boolean);
      run.facts_used = facts.map((q) => {
        const url = verify(q, '');
        return { quote: q, verified: !!url, source_url: url || '' };
      });
      if (run.facts_used.some((f) => !f.verified)) addFlag(FLAG_CLAIM);
      if (facts.length === 0) addFlag('the AI listed no quoted facts for the email; check the hook by hand');

      const words = wordCount(body);
      if (words >= 120) addFlag(`email is ${words} words (rule: under 120)`);
      if (body.includes('!')) addFlag('email contains an exclamation mark');
      if (/\p{Extended_Pictographic}/u.test(body)) addFlag('email contains an emoji');
      const first = String(contact.person_name || '').trim().split(/\s+/)[0];
      if (first && !body.toLowerCase().includes(first.toLowerCase())) addFlag("email doesn't use the contact's first name");

      step('email', flags.includes(FLAG_CLAIM) ? 'flag' : 'done', `${words} words drafted`);
      return await finish();
    }
  } catch (e) {
    const msg = e?.message || String(e);
    if (currentStep) step(currentStep, 'error', msg);
    run.status = 'ERROR';
    run.status_reason = msg;
    return await finish();
  }

  // ---------- 12. Save everything ----------
  async function finish() {
    const seconds = Math.round(elapsed() * 10) / 10;
    const row = {
      ...run,
      flags,
      pages_fetched: pagesFetched,
      seconds_taken: seconds,
      step_log: stepLog,
    };
    let saved = null;
    try {
      const { data, error } = await db().from('runs').insert(row).select('id').single();
      if (error) throw new Error(dbError(error, 'Could not save the run'));
      saved = data;
    } catch (e) {
      emit({
        type: 'error',
        message: run.status === 'ERROR' ? `${run.status_reason} (The run could not be saved either.)` : e.message,
      });
      return { ...row, id: null };
    }
    emit({
      type: 'done',
      run: {
        id: saved.id,
        domain: row.domain,
        company_name: row.company_name,
        status: row.status,
        status_label: STATUS_LABELS[row.status],
        status_reason: row.status_reason,
        flags: flags.length,
        seconds: seconds,
      },
    });
    return { ...row, id: saved.id };
  }
}
