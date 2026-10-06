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
