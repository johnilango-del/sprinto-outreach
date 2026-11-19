-- Sprinto Outreach Desk: database schema
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to run more than once: every table uses "create table if not exists".
-- Nothing here drops or changes an existing table.
--
-- Row Level Security is switched ON with no public policies, so the public
-- (anon / publishable) key can read nothing. The app talks to the database
-- only from the server, using the SECRET key, which bypasses RLS.
-- No contact data is seeded here: contacts are personal data and are entered in the app.

create extension if not exists pgcrypto;

-- 1. Contacts: the Growth Lead's backup list (looked up on Apollo by hand)
create table if not exists public.contacts (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  company_name text not null,
  domains      text[] not null default '{}',
  person_name  text not null,
  title        text,
  email        text,
  why_chosen   text
);
create index if not exists contacts_domains_idx on public.contacts using gin (domains);

-- 2. Pages: the fetch cache. A page fetched in the last 7 days is reused, never fetched again.
create table if not exists public.pages (
  id          uuid primary key default gen_random_uuid(),
  url         text not null unique,
  final_url   text,
  fetched_at  timestamptz not null default now(),
  http_status integer,
  title       text,
  raw_text    text,
  clean_text  text,
  word_count  integer,
  links       jsonb not null default '[]'::jsonb,
  error       text
);
create index if not exists pages_fetched_at_idx on public.pages (fetched_at);

-- 3. Hunter results: saved Hunter replies, reused for 30 days so a re-run costs no credits.
--    Domain Search is saved under the domain ("logpulse.io"); Email Finder under "finder:<domain>:<first> <last>".
create table if not exists public.hunter_results (
  id         uuid primary key default gen_random_uuid(),
  domain     text not null unique,
  fetched_at timestamptz not null default now(),
  raw        jsonb not null
);
create index if not exists hunter_results_fetched_at_idx on public.hunter_results (fetched_at);

-- 4. Runs: one row per company per run
create table if not exists public.runs (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  domain             text not null,
  company_name       text,
  status             text not null check (status in ('GOOD_FIT','GOOD_FIT_FLAGGED','NOT_A_FIT','NEEDS_REVIEW','NO_CONTACT','ERROR')),
  status_reason      text,
  fields             jsonb not null default '{}'::jsonb,   -- certified, b2b_saas, handles_data, pressure_signals, stage
  pressure_points    integer not null default 0,
  flags              jsonb not null default '[]'::jsonb,
  pages_fetched      jsonb not null default '[]'::jsonb,
  contact_id         uuid references public.contacts(id) on delete set null,  -- set only when the contact came from the Apollo list
  contact_source     text check (contact_source in ('hunter','team_page_hunter','apollo_list')),
  contact_name       text,
  contact_title      text,
  contact_email      text,
  contact_confidence integer,                                -- Hunter email confidence, 0-100
  pick_reason        text,
  contact_attempts   jsonb not null default '[]'::jsonb,  -- every contact source tried and what it returned
  contact_check      jsonb,
  pain_points        jsonb,
  email_subject      text,
  email_original     text,
  email_final        text,
  edit_percent       integer,
  email_status       text check (email_status in ('draft','sending','sent','skipped')),
  email_sender       text,
  sent_at            timestamptz,
  facts_used         jsonb,                                  -- [{quote, verified, source_url}]
  fit_agreement      text check (fit_agreement in ('agree','disagree')),
  seconds_taken      numeric,
  step_log           jsonb not null default '[]'::jsonb
);
create index if not exists runs_created_at_idx on public.runs (created_at desc);
create index if not exists runs_domain_idx on public.runs (domain);

-- Lock the tables to the server's secret key only.
alter table public.contacts       enable row level security;
alter table public.pages          enable row level security;
alter table public.hunter_results enable row level security;
alter table public.runs           enable row level security;

-- ------------------------------------------------------------------
-- UPGRADE for databases created before the team-page contact source (19 Nov 2026).
-- Safe to run on a new database too: it changes nothing if already up to date.
alter table public.runs add column if not exists contact_attempts jsonb not null default '[]'::jsonb;
alter table public.runs drop constraint if exists runs_contact_source_check;
alter table public.runs add constraint runs_contact_source_check
  check (contact_source in ('hunter','team_page_hunter','apollo_list'));
