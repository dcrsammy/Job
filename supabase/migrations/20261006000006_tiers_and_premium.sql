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
