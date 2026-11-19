# Sprinto Outreach Desk

An internal tool for Sprinto's Growth Lead. Paste company websites; for each one the system reads the site, checks it against `fit-rules.txt`, matches the contact you entered, picks two pain points and drafts a first cold email. **Nothing is sent automatically.** An email is sent only when you click "Send to my inbox", and it only goes to `EMAIL_TEST_RECIPIENT`.

## The three rules built into the code
1. The system researches, judges and drafts. You decide. One click sends one email, to your own inbox only, once.
2. The AI (Gemini) fills fact fields. Plain code checks the quotes, adds up points, sets the status and decides whether to fetch another page.
3. Nothing is invented. Every AI fact needs an exact quote; code checks the quote is really on the fetched page and removes (and flags) any that are not.

## Setup
1. Supabase: SQL Editor → paste `supabase/schema.sql` → Run.
2. Vercel: import the repo, add the environment variables listed in `.env.example`, deploy.
3. Open the app → Contacts → add the people you picked on Apollo → Run a list.

## Where things live
- `fit-rules.txt` is the rulebook. It is read at runtime and also embedded at build time (`scripts/embed-rules.mjs`).
- `lib/pipeline.js`: the research steps for one company.
- `lib/certCheck.js`: SOC 2 / ISO 27001 check with the nearby-words rule.
- `lib/status.js`: the status decision, in plain code.
