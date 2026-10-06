-- ============================================================
-- Full database setup: paste this whole file into the Supabase
-- SQL Editor and click Run. Run it once, on a new project.
-- (Generated from supabase/migrations/*.sql + supabase/seed.sql)
-- ============================================================

-- >>> supabase/migrations/20261006000001_core_schema.sql
-- =============================================================================
-- Core schema: users, candidate profiles, resumes, jobs, matching, applications,
-- billing, AI usage, audit and background work.
--
-- Conventions
--   * Every user-owned row carries user_id and is protected by RLS (see 0003).
--   * Writes that must not be user-controlled (matches, AI usage, audit, ingestion)
--     are performed with the service role from server code only.
--   * "provenance" records where a candidate fact came from:
--       extracted = present in the uploaded resume (with an evidence quote)
--       inferred  = derived by the system (always shown to the user as such)
--       user      = typed or confirmed by the user
-- =============================================================================

create schema if not exists extensions;
create extension if not exists vector with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.plan_tier as enum ('free', 'pro');
create type public.provenance as enum ('extracted', 'inferred', 'user');
create type public.remote_type as enum ('remote', 'hybrid', 'onsite', 'unknown');
create type public.seniority_level as enum
  ('intern', 'junior', 'mid', 'senior', 'lead', 'principal', 'executive', 'unknown');
create type public.verification_status as enum ('official', 'third_party', 'flagged');
create type public.application_status as enum
  ('saved', 'interested', 'preparing', 'applied', 'interview', 'rejected', 'offer', 'withdrawn');
create type public.source_kind as enum
  ('greenhouse', 'lever', 'ashby', 'remotive', 'arbeitnow', 'remoteok', 'adzuna', 'jsonld');
create type public.resume_status as enum ('uploaded', 'parsing', 'parsed', 'failed');
create type public.task_status as enum ('queued', 'running', 'done', 'failed');
create type public.run_status as enum ('running', 'success', 'partial', 'failed');
create type public.match_band as enum ('high', 'possible', 'low');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'user' check (role in ('user', 'admin')),
  -- null = keep resume files until the user deletes them
  resume_retention_days integer check (resume_retention_days is null or resume_retention_days between 1 and 3650),
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin');
$$;

-- ---------------------------------------------------------------------------
-- Candidate profile
-- ---------------------------------------------------------------------------
create table public.candidate_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  headline text,
  summary text,
  years_experience numeric(4,1),
  years_experience_provenance public.provenance,
  seniority public.seniority_level not null default 'unknown',
  seniority_provenance public.provenance,
  role_families text[] not null default '{}',
  industries text[] not null default '{}',
  preferred_locations text[] not null default '{}',
  -- ISO 3166-1 alpha-2 codes where the user can legally work without sponsorship
  authorized_countries text[] not null default '{}',
  needs_sponsorship boolean,
  remote_preference text not null default 'remote_only'
    check (remote_preference in ('remote_only', 'remote_or_hybrid', 'any')),
  base_country text,
  timezone text,
  salary_min integer check (salary_min is null or salary_min >= 0),
  salary_currency text default 'USD',
  languages text[] not null default '{}',
  contact jsonb not null default '{}'::jsonb,
  source_resume_id uuid,
  confirmed_at timestamptz,
  embedding extensions.vector(1024),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger candidate_profiles_updated_at before update on public.candidate_profiles
  for each row execute function public.set_updated_at();

create table public.resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text not null check (mime_type in (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 5242880),
  sha256 text not null,
  status public.resume_status not null default 'uploaded',
  raw_text text,
  parse_error text,
  parsed_at timestamptz,
  is_primary boolean not null default true,
  delete_after timestamptz,
  created_at timestamptz not null default now()
);
create index resumes_user_idx on public.resumes (user_id, created_at desc);
create unique index resumes_one_primary on public.resumes (user_id) where is_primary;

alter table public.candidate_profiles
  add constraint candidate_profiles_source_resume_fk
  foreign key (source_resume_id) references public.resumes (id) on delete set null;

create table public.skills (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  category text,
  aliases text[] not null default '{}'
);

create table public.candidate_skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  candidate_profile_id uuid not null references public.candidate_profiles (id) on delete cascade,
  skill_id uuid references public.skills (id) on delete set null,
  name text not null,
  normalized text not null,
  years numeric(4,1),
  provenance public.provenance not null,
  evidence text,
  created_at timestamptz not null default now(),
  unique (candidate_profile_id, normalized)
);
create index candidate_skills_user_idx on public.candidate_skills (user_id);

create table public.experiences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  candidate_profile_id uuid not null references public.candidate_profiles (id) on delete cascade,
  employer text not null,
  title text not null,
  location text,
  start_date date,
  end_date date,
  is_current boolean not null default false,
  description text,
  highlights text[] not null default '{}',
  skills text[] not null default '{}',
  provenance public.provenance not null,
  evidence text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);
create index experiences_profile_idx on public.experiences (candidate_profile_id, sort_order);

create table public.educations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  candidate_profile_id uuid not null references public.candidate_profiles (id) on delete cascade,
  kind text not null default 'degree' check (kind in ('degree', 'certification', 'course')),
  institution text not null,
  qualification text,
  field text,
  level text check (level is null or level in ('secondary', 'associate', 'bachelor', 'master', 'doctorate', 'other')),
  start_date date,
  end_date date,
  provenance public.provenance not null,
  evidence text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index educations_profile_idx on public.educations (candidate_profile_id, sort_order);

create table public.resume_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  resume_id uuid references public.resumes (id) on delete cascade,
  job_id uuid,
  kind text not null check (kind in ('parsed', 'tailored', 'user_edit')),
  content jsonb not null,
  content_text text,
  created_at timestamptz not null default now()
);
create index resume_versions_user_idx on public.resume_versions (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Jobs
-- ---------------------------------------------------------------------------
create table public.job_sources (
  id uuid primary key default gen_random_uuid(),
  kind public.source_kind not null,
  name text not null,
  slug text not null unique,
  -- connector-specific settings, e.g. {"board": "gitlab"} or {"url": "https://..."}
  config jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  -- true when listings come straight from the employer's own applicant tracking system
  is_official boolean not null default false,
  attribution text,
  terms_url text,
  min_interval_minutes integer not null default 360 check (min_interval_minutes >= 15),
  last_run_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  consecutive_failures integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.employers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null unique,
  website text,
  domain text,
  created_at timestamptz not null default now()
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.job_sources (id) on delete cascade,
  external_id text not null,
  employer_id uuid references public.employers (id) on delete set null,
  employer_name text not null,
  title text not null,
  normalized_title text not null,
  description_text text not null default '',
  location_raw text,
  locations text[] not null default '{}',
  countries text[] not null default '{}',
  remote_type public.remote_type not null default 'unknown',
  -- e.g. {'Worldwide'} or {'US', 'CA'}; empty = not stated
  remote_regions text[] not null default '{}',
  employment_type text,
  seniority public.seniority_level not null default 'unknown',
  department text,
  salary_min integer,
  salary_max integer,
  salary_currency text,
  salary_period text check (salary_period is null or salary_period in ('year', 'month', 'hour')),
  posted_at timestamptz,
  deadline_at timestamptz,
  apply_url text,
  source_url text,
  apply_domain text,
  is_official_link boolean not null default false,
  verification_status public.verification_status not null default 'third_party',
  verification_flags text[] not null default '{}',
  fingerprint text not null,
  duplicate_of uuid references public.jobs (id) on delete set null,
  is_active boolean not null default true,
  requirements_extracted_by text not null default 'heuristic'
    check (requirements_extracted_by in ('heuristic', 'ai')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  search tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(employer_name, '')), 'B') ||
    setweight(to_tsvector('english', left(coalesce(description_text, ''), 20000)), 'C')
  ) stored,
  embedding extensions.vector(1024),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, external_id)
);
create trigger jobs_updated_at before update on public.jobs
  for each row execute function public.set_updated_at();
create index jobs_active_idx on public.jobs (is_active, posted_at desc) where duplicate_of is null;
create index jobs_fingerprint_idx on public.jobs (fingerprint);
create index jobs_search_idx on public.jobs using gin (search);
create index jobs_title_trgm_idx on public.jobs using gin (normalized_title extensions.gin_trgm_ops);

alter table public.resume_versions
  add constraint resume_versions_job_fk foreign key (job_id) references public.jobs (id) on delete set null;

create table public.job_requirements (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  kind text not null check (kind in
    ('skill', 'experience', 'education', 'certification', 'authorization', 'location', 'language', 'other')),
  text text not null,
  normalized text,
  importance text not null default 'required' check (importance in ('required', 'preferred')),
  min_years numeric(4,1),
  extracted_by text not null default 'heuristic' check (extracted_by in ('heuristic', 'ai'))
);
create index job_requirements_job_idx on public.job_requirements (job_id);

create table public.job_matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  score integer not null check (score between 0 and 100),
  band public.match_band not null,
  breakdown jsonb not null,
  reasons text[] not null default '{}',
  gaps text[] not null default '{}',
  disqualifiers text[] not null default '{}',
  uncertain text[] not null default '{}',
  engine_version text not null,
  computed_at timestamptz not null default now(),
  unique (user_id, job_id)
);
create index job_matches_user_score_idx on public.job_matches (user_id, score desc);

-- ---------------------------------------------------------------------------
-- Applications
-- ---------------------------------------------------------------------------
create table public.tailored_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'reviewed', 'exported')),
  -- requirement -> candidate evidence mapping
  evidence_map jsonb not null default '[]'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  resume_content jsonb,
  resume_text text,
  missing_info jsonb not null default '[]'::jsonb,
  checklist jsonb not null default '[]'::jsonb,
  fabrication_warnings jsonb not null default '[]'::jsonb,
  model text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, job_id)
);
create trigger tailored_applications_updated_at before update on public.tailored_applications
  for each row execute function public.set_updated_at();

create table public.cover_letters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  tailored_application_id uuid not null unique references public.tailored_applications (id) on delete cascade,
  content text not null,
  edited_by_user boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger cover_letters_updated_at before update on public.cover_letters
  for each row execute function public.set_updated_at();

create table public.application_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  tailored_application_id uuid not null references public.tailored_applications (id) on delete cascade,
  question text not null,
  answer text not null default '',
  needs_user_input boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index application_answers_app_idx on public.application_answers (tailored_application_id, sort_order);

create table public.saved_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  -- one row per user/job interaction: saved, hidden and/or viewed
  saved boolean not null default false,
  hidden boolean not null default false,
  viewed_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, job_id)
);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  status public.application_status not null default 'interested',
  tailored_application_id uuid references public.tailored_applications (id) on delete set null,
  applied_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, job_id)
);
create trigger applications_updated_at before update on public.applications
  for each row execute function public.set_updated_at();
create index applications_user_idx on public.applications (user_id, updated_at desc);

-- ---------------------------------------------------------------------------
-- Billing, usage, audit
-- ---------------------------------------------------------------------------
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  plan public.plan_tier not null default 'free',
  status text not null default 'active' check (status in ('active', 'past_due', 'canceled', 'trialing')),
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  current_period_end timestamptz,
  -- pay-as-you-go credits for users who prefer not to subscribe
  credits integer not null default 0 check (credits >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  feature text not null,
  provider text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd numeric(10,6) not null default 0,
  ok boolean not null default true,
  created_at timestamptz not null default now()
);
create index ai_usage_user_feature_idx on public.ai_usage (user_id, feature, created_at desc);
create index ai_usage_created_idx on public.ai_usage (created_at desc);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  actor text not null default 'user' check (actor in ('user', 'system', 'admin')),
  action text not null,
  entity text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_user_idx on public.audit_logs (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Background work
-- ---------------------------------------------------------------------------
create table public.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.job_sources (id) on delete cascade,
  status public.run_status not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  fetched integer not null default 0,
  inserted integer not null default 0,
  updated integer not null default 0,
  deactivated integer not null default 0,
  flagged integer not null default 0,
  duplicates integer not null default 0,
  errors jsonb not null default '[]'::jsonb
);
create index ingestion_runs_source_idx on public.ingestion_runs (source_id, started_at desc);

create table public.task_queue (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('ingest_source', 'match_user', 'purge_expired')),
  payload jsonb not null default '{}'::jsonb,
  status public.task_status not null default 'queued',
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  dedupe_key text,
  created_at timestamptz not null default now()
);
create index task_queue_ready_idx on public.task_queue (status, run_after);
create unique index task_queue_dedupe_idx on public.task_queue (dedupe_key)
  where dedupe_key is not null and status in ('queued', 'running');

-- Atomically claim up to p_limit ready tasks (safe with concurrent workers).
create or replace function public.claim_tasks(p_limit integer)
returns setof public.task_queue
language plpgsql security definer set search_path = public as $$
begin
  -- recover tasks whose worker died
  update public.task_queue
     set status = 'queued', locked_at = null
   where status = 'running' and locked_at < now() - interval '15 minutes';

  return query
  update public.task_queue t
     set status = 'running', locked_at = now(), attempts = t.attempts + 1
   where t.id in (
     select id from public.task_queue
      where status = 'queued' and run_after <= now()
      order by run_after
      limit p_limit
      for update skip locked)
  returning t.*;
end $$;

create or replace function public.enqueue_task(p_kind text, p_payload jsonb, p_dedupe_key text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into public.task_queue (kind, payload, dedupe_key)
  values (p_kind, coalesce(p_payload, '{}'::jsonb), p_dedupe_key)
  on conflict (dedupe_key) where dedupe_key is not null and status in ('queued', 'running')
  do nothing
  returning id into v_id;
  return v_id;
end $$;

-- Count a user's usage of an AI feature in the current calendar month.
create or replace function public.monthly_usage(p_user uuid, p_feature text)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::integer from public.ai_usage
   where user_id = p_user and feature = p_feature and ok
     and created_at >= date_trunc('month', now());
$$;

-- ---------------------------------------------------------------------------
-- New user bootstrap
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'));
  insert into public.candidate_profiles (user_id) values (new.id);
  insert into public.subscriptions (user_id) values (new.id);
  insert into public.audit_logs (user_id, actor, action) values (new.id, 'system', 'account.created');
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- >>> supabase/migrations/20261006000002_rls.sql
-- =============================================================================
-- Row level security.
-- Users can only ever see and change their own rows. Shared job data is
-- read-only for signed-in users. System-computed tables (matches, AI usage,
-- audit, ingestion, queue) are written by the service role only.
-- =============================================================================

-- Owner-managed tables: full CRUD on own rows -------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'candidate_skills', 'experiences', 'educations', 'resume_versions',
    'saved_jobs', 'applications', 'cover_letters', 'application_answers'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy "%1$s_select_own" on public.%1$I for select to authenticated using (user_id = auth.uid())$p$, t);
    execute format($p$create policy "%1$s_insert_own" on public.%1$I for insert to authenticated with check (user_id = auth.uid())$p$, t);
    execute format($p$create policy "%1$s_update_own" on public.%1$I for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())$p$, t);
    execute format($p$create policy "%1$s_delete_own" on public.%1$I for delete to authenticated using (user_id = auth.uid())$p$, t);
  end loop;
end $$;

-- Owner can read/update/delete but not insert (created by trigger or server) --
alter table public.candidate_profiles enable row level security;
create policy candidate_profiles_select_own on public.candidate_profiles for select to authenticated using (user_id = auth.uid());
create policy candidate_profiles_update_own on public.candidate_profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.resumes enable row level security;
create policy resumes_select_own on public.resumes for select to authenticated using (user_id = auth.uid());
create policy resumes_delete_own on public.resumes for delete to authenticated using (user_id = auth.uid());

alter table public.tailored_applications enable row level security;
create policy tailored_select_own on public.tailored_applications for select to authenticated using (user_id = auth.uid());
create policy tailored_update_own on public.tailored_applications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy tailored_delete_own on public.tailored_applications for delete to authenticated using (user_id = auth.uid());

-- Profiles: users may edit only harmless columns (never role) ---------------
alter table public.profiles enable row level security;
create policy profiles_select_own on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy profiles_update_own on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated;
grant update (full_name, resume_retention_days, onboarding_completed) on public.profiles to authenticated;

-- Read-only for owner; written by server ------------------------------------
alter table public.job_matches enable row level security;
create policy job_matches_select_own on public.job_matches for select to authenticated using (user_id = auth.uid());

alter table public.subscriptions enable row level security;
create policy subscriptions_select_own on public.subscriptions for select to authenticated using (user_id = auth.uid());

alter table public.ai_usage enable row level security;
create policy ai_usage_select_own on public.ai_usage for select to authenticated using (user_id = auth.uid() or public.is_admin());

alter table public.audit_logs enable row level security;
create policy audit_logs_select_own on public.audit_logs for select to authenticated using (user_id = auth.uid() or public.is_admin());

-- Shared catalogue: readable by signed-in users, writable by admins ---------
alter table public.jobs enable row level security;
create policy jobs_read on public.jobs for select to authenticated using (true);

alter table public.job_requirements enable row level security;
create policy job_requirements_read on public.job_requirements for select to authenticated using (true);

alter table public.employers enable row level security;
create policy employers_read on public.employers for select to authenticated using (true);

alter table public.skills enable row level security;
create policy skills_read on public.skills for select to authenticated using (true);

alter table public.job_sources enable row level security;
create policy job_sources_read on public.job_sources for select to authenticated using (true);
create policy job_sources_admin_write on public.job_sources for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Operations: admins only ---------------------------------------------------
alter table public.ingestion_runs enable row level security;
create policy ingestion_runs_admin on public.ingestion_runs for select to authenticated using (public.is_admin());

alter table public.task_queue enable row level security;
create policy task_queue_admin on public.task_queue for select to authenticated using (public.is_admin());

-- Functions that must never be called by end users --------------------------
revoke execute on function public.claim_tasks(integer) from public, anon, authenticated;
revoke execute on function public.enqueue_task(text, jsonb, text) from public, anon, authenticated;
revoke execute on function public.monthly_usage(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_tasks(integer) to service_role;
grant execute on function public.enqueue_task(text, jsonb, text) to service_role;
grant execute on function public.monthly_usage(uuid, text) to service_role;

-- >>> supabase/migrations/20261006000003_storage.sql
-- =============================================================================
-- Private storage for resumes and generated documents.
-- Object paths are "<user_id>/<file>", so the first folder must match the user.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('resumes', 'resumes', false, 5242880, array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  ('documents', 'documents', false, 5242880, null)
on conflict (id) do nothing;

create policy "own resume files: read" on storage.objects for select to authenticated
  using (bucket_id in ('resumes', 'documents') and (storage.foldername(name))[1] = auth.uid()::text);

create policy "own resume files: upload" on storage.objects for insert to authenticated
  with check (bucket_id in ('resumes', 'documents') and (storage.foldername(name))[1] = auth.uid()::text);

create policy "own resume files: delete" on storage.objects for delete to authenticated
  using (bucket_id in ('resumes', 'documents') and (storage.foldername(name))[1] = auth.uid()::text);

-- >>> supabase/migrations/20261006000004_functions.sql
-- Helper functions used by server code (service role only).

-- Pre-select jobs worth scoring for a candidate: full-text OR over their
-- skills/role terms, ranked, limited to active, canonical listings that are
-- recent -- or still live on the employer's own board (evergreen roles).
create or replace function public.match_candidate_jobs(p_terms text[], p_since timestamptz, p_limit integer)
returns table (id uuid)
language plpgsql stable security definer set search_path = public as $$
declare
  q tsquery := null;
  t text;
begin
  foreach t in array coalesce(p_terms, '{}') loop
    if length(trim(t)) > 1 then
      if q is null then q := plainto_tsquery('english', t);
      else q := q || plainto_tsquery('english', t);
      end if;
    end if;
  end loop;

  if q is null or q::text = '' then
    return query
      select j.id from public.jobs j
       where j.is_active and j.duplicate_of is null
         and (coalesce(j.posted_at, j.first_seen_at) >= p_since or j.verification_status = 'official')
       order by coalesce(j.posted_at, j.first_seen_at) desc
       limit p_limit;
  else
    return query
      select j.id from public.jobs j
       where j.is_active and j.duplicate_of is null
         and (coalesce(j.posted_at, j.first_seen_at) >= p_since or j.verification_status = 'official')
         and j.search @@ q
       order by ts_rank(j.search, q) desc
       limit p_limit;
  end if;
end $$;

-- Per-source health numbers for the admin dashboard.
create or replace function public.source_stats()
returns table (source_id uuid, active_jobs bigint, flagged_jobs bigint, official_jobs bigint)
language sql stable security definer set search_path = public as $$
  select s.id,
         count(j.id) filter (where j.is_active and j.duplicate_of is null),
         count(j.id) filter (where j.is_active and j.verification_status = 'flagged'),
         count(j.id) filter (where j.is_active and j.verification_status = 'official')
    from public.job_sources s
    left join public.jobs j on j.source_id = s.id
   group by s.id;
$$;

-- Hard-delete expired resume rows; storage objects are removed by the worker first.
create or replace function public.expired_resumes(p_limit integer)
returns setof public.resumes
language sql stable security definer set search_path = public as $$
  select * from public.resumes where delete_after is not null and delete_after < now() limit p_limit;
$$;

revoke execute on function public.match_candidate_jobs(text[], timestamptz, integer) from public, anon, authenticated;
revoke execute on function public.source_stats() from public, anon, authenticated;
revoke execute on function public.expired_resumes(integer) from public, anon, authenticated;
grant execute on function public.match_candidate_jobs(text[], timestamptz, integer) to service_role;
grant execute on function public.source_stats() to service_role;
grant execute on function public.expired_resumes(integer) to service_role;

-- >>> supabase/migrations/20261006000005_application_followup.sql
-- Application follow-up: automatic "No response" after 30 days, and
-- "Listing closed" when a job disappears before the user applied.
alter type public.application_status add value if not exists 'no_response';
alter type public.application_status add value if not exists 'closed';

alter table public.applications
  add column if not exists auto_closed_at timestamptz,
  add column if not exists auto_closed_reason text;

-- >>> supabase/migrations/20261006000006_tiers_and_premium.sql
-- Plans: Basic (stored as 'free'), Pro and Premium.
-- A plan picked at sign-up is stored as a request; an admin (or, later, a
-- payment) activates it. Premium adds interview prep and follow-up emails.
alter type public.plan_tier add value if not exists 'premium';

alter table public.subscriptions
  add column if not exists requested_plan text check (requested_plan in ('pro', 'premium')),
  add column if not exists requested_at timestamptz,
  add column if not exists granted_by uuid references public.profiles (id) on delete set null,
  add column if not exists admin_note text;

-- New accounts: record the plan chosen on the sign-up form.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  choice text := new.raw_user_meta_data ->> 'plan_choice';
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'));
  insert into public.candidate_profiles (user_id) values (new.id);
  if choice in ('pro', 'premium') then
    insert into public.subscriptions (user_id, requested_plan, requested_at) values (new.id, choice, now());
    insert into public.audit_logs (user_id, actor, action, metadata) values (new.id, 'system', 'account.created', jsonb_build_object('requested_plan', choice));
  else
    insert into public.subscriptions (user_id) values (new.id);
    insert into public.audit_logs (user_id, actor, action) values (new.id, 'system', 'account.created');
  end if;
  return new;
end $$;

-- Premium extras: interview prep per job, follow-up email drafts per application.
create table if not exists public.application_extras (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  kind text not null check (kind in ('interview_prep', 'follow_up')),
  content jsonb not null default '{}'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, job_id, kind)
);
drop trigger if exists application_extras_updated_at on public.application_extras;
create trigger application_extras_updated_at before update on public.application_extras
  for each row execute function public.set_updated_at();

alter table public.application_extras enable row level security;
drop policy if exists application_extras_select_own on public.application_extras;
create policy application_extras_select_own on public.application_extras for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists application_extras_delete_own on public.application_extras;
create policy application_extras_delete_own on public.application_extras for delete to authenticated using (user_id = auth.uid());

-- Admins can read every subscription (users still see only their own).
drop policy if exists subscriptions_select_admin on public.subscriptions;
create policy subscriptions_select_admin on public.subscriptions for select to authenticated using (public.is_admin());

create index if not exists subscriptions_requested_idx on public.subscriptions (requested_at) where requested_plan is not null;
create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);
create index if not exists ai_usage_created_idx on public.ai_usage (created_at desc);

-- >>> supabase/seed.sql
-- Initial job sources. Employer boards (Greenhouse, Lever, Ashby) are the
-- employers' own public job-board APIs, so listings link to the official
-- application page. Aggregators are credited and linked back per their terms.
-- Admins can add/disable sources from /admin.

insert into public.job_sources (kind, name, slug, config, is_official, attribution, terms_url, min_interval_minutes, enabled) values
  ('greenhouse', 'GitLab', 'gh-gitlab', '{"board":"gitlab"}', true, null, null, 360, true),
  ('greenhouse', 'Stripe', 'gh-stripe', '{"board":"stripe"}', true, null, null, 360, true),
  ('greenhouse', 'Figma', 'gh-figma', '{"board":"figma"}', true, null, null, 360, true),
  ('greenhouse', 'Discord', 'gh-discord', '{"board":"discord"}', true, null, null, 360, true),
  ('greenhouse', 'Cloudflare', 'gh-cloudflare', '{"board":"cloudflare"}', true, null, null, 360, true),
  ('greenhouse', 'Vercel', 'gh-vercel', '{"board":"vercel"}', true, null, null, 360, true),
  ('greenhouse', 'Airbnb', 'gh-airbnb', '{"board":"airbnb"}', true, null, null, 360, true),
  ('greenhouse', 'Databricks', 'gh-databricks', '{"board":"databricks"}', true, null, null, 360, true),
  ('greenhouse', 'Datadog', 'gh-datadog', '{"board":"datadog"}', true, null, null, 360, true),
  ('greenhouse', 'Coinbase', 'gh-coinbase', '{"board":"coinbase"}', true, null, null, 360, true),
  ('greenhouse', 'Anthropic', 'gh-anthropic', '{"board":"anthropic"}', true, null, null, 360, true),
  ('greenhouse', 'Twilio', 'gh-twilio', '{"board":"twilio"}', true, null, null, 360, true),
  ('greenhouse', 'Elastic', 'gh-elastic', '{"board":"elastic"}', true, null, null, 360, true),
  ('greenhouse', 'MongoDB', 'gh-mongodb', '{"board":"mongodb"}', true, null, null, 360, true),
  ('greenhouse', 'Grafana Labs', 'gh-grafanalabs', '{"board":"grafanalabs"}', true, null, null, 360, true),
  ('greenhouse', 'Automattic', 'gh-automattic', '{"board":"automatticcareers"}', true, null, null, 360, true),
  ('greenhouse', 'Canonical', 'gh-canonical', '{"board":"canonical"}', true, null, null, 360, true),
  ('greenhouse', 'Duolingo', 'gh-duolingo', '{"board":"duolingo"}', true, null, null, 360, true),
  ('greenhouse', 'Webflow', 'gh-webflow', '{"board":"webflow"}', true, null, null, 360, true),
  ('lever', 'Palantir', 'lv-palantir', '{"company":"palantir"}', true, null, null, 360, true),
  ('lever', 'Spotify', 'lv-spotify', '{"company":"spotify"}', true, null, null, 360, true),
  ('lever', 'Binance', 'lv-binance', '{"company":"binance"}', true, null, null, 360, true),
  ('lever', 'Outreach', 'lv-outreach', '{"company":"outreach"}', true, null, null, 360, true),
  ('ashby', 'Linear', 'ab-linear', '{"board":"linear"}', true, null, null, 360, true),
  ('ashby', 'Notion', 'ab-notion', '{"board":"notion"}', true, null, null, 360, true),
  ('ashby', 'Ramp', 'ab-ramp', '{"board":"ramp"}', true, null, null, 360, true),
  ('ashby', 'PostHog', 'ab-posthog', '{"board":"posthog"}', true, null, null, 360, true),
  ('ashby', 'Supabase', 'ab-supabase', '{"board":"supabase"}', true, null, null, 360, true),
  ('ashby', 'OpenAI', 'ab-openai', '{"board":"openai"}', true, null, null, 360, true),
  ('ashby', 'Cursor', 'ab-cursor', '{"board":"cursor"}', true, null, null, 360, true),
  ('ashby', 'Zapier', 'ab-zapier', '{"board":"zapier"}', true, null, null, 360, true),
  -- Remote-first employers that often hire internationally
  ('greenhouse', 'Wikimedia Foundation', 'gh-wikimedia', '{"board":"wikimedia"}', true, null, null, 720, true),
  ('greenhouse', 'Mozilla', 'gh-mozilla', '{"board":"mozilla"}', true, null, null, 720, true),
  ('greenhouse', 'Tailscale', 'gh-tailscale', '{"board":"tailscale"}', true, null, null, 720, true),
  ('greenhouse', 'Mattermost', 'gh-mattermost', '{"board":"mattermost"}', true, null, null, 720, true),
  ('greenhouse', 'Bitwarden', 'gh-bitwarden', '{"board":"bitwarden"}', true, null, null, 720, true),
  ('greenhouse', 'Ghost', 'gh-ghost', '{"board":"ghost"}', true, null, null, 720, true),
  ('greenhouse', 'Typeform', 'gh-typeform', '{"board":"typeform"}', true, null, null, 720, true),
  ('greenhouse', 'Turing', 'gh-turing', '{"board":"turing"}', true, null, null, 720, true),
  ('ashby', 'ClickHouse', 'ab-clickhouse', '{"board":"clickhouse"}', true, null, null, 720, true),
  ('ashby', '1Password', 'ab-1password', '{"board":"1password"}', true, null, null, 720, true),
  ('ashby', 'Sentry', 'ab-sentry', '{"board":"sentry"}', true, null, null, 720, true),
  ('ashby', 'Airbyte', 'ab-airbyte', '{"board":"airbyte"}', true, null, null, 720, true),
  ('ashby', 'n8n', 'ab-n8n', '{"board":"n8n"}', true, null, null, 720, true),
  ('ashby', 'Miro', 'ab-miro', '{"board":"miro"}', true, null, null, 720, true),
  ('ashby', 'Oyster', 'ab-oyster', '{"board":"oyster"}', true, null, null, 720, true),
  ('ashby', 'Andela', 'ab-andela', '{"board":"andela"}', true, null, null, 720, true),
  ('remoteok', 'Remote OK', 'agg-remoteok', '{}', false,
    'Listing from Remote OK', 'https://remoteok.com/api', 720, true),
  ('arbeitnow', 'Arbeitnow', 'agg-arbeitnow', '{"maxPages":3}', false,
    'Listing from Arbeitnow', 'https://www.arbeitnow.com/api/job-board-api', 720, true),
  -- Remotive's terms forbid showing their jobs behind a sign-up wall. Keep
  -- disabled unless you have a commercial agreement with Remotive.
  ('remotive', 'Remotive', 'agg-remotive', '{}', false,
    'Listing from Remotive', 'https://remotive.com/api-documentation', 720, false)
on conflict (slug) do nothing;

