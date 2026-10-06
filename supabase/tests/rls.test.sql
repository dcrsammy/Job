-- RLS checks: run after migrations + seed on the stubbed database.
\set ON_ERROR_STOP on
begin;
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com');

-- trigger bootstrapped profile rows
do $$ begin
  assert (select count(*) from public.profiles) = 2, 'profiles not created';
  assert (select count(*) from public.candidate_profiles) = 2, 'candidate_profiles not created';
  assert (select count(*) from public.subscriptions) = 2, 'subscriptions not created';
end $$;

-- user A adds a skill and an application
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
insert into public.candidate_skills (user_id, candidate_profile_id, name, normalized, provenance)
  select '11111111-1111-1111-1111-111111111111', id, 'React', 'react', 'user' from public.candidate_profiles;
do $$ begin
  assert (select count(*) from public.candidate_profiles) = 1, 'A should see only own candidate profile';
  assert (select count(*) from public.candidate_skills) = 1, 'A should see own skill';
  assert (select count(*) from public.job_sources) > 10, 'job sources should be readable';
end $$;

-- A cannot write rows for B
do $$ begin
  begin
    insert into public.saved_jobs (user_id, job_id) values ('22222222-2222-2222-2222-222222222222', gen_random_uuid());
    raise exception 'insert for another user should fail';
  exception when insufficient_privilege or check_violation or foreign_key_violation then null;
    when others then if sqlerrm like '%row-level security%' then null; else raise; end if;
  end;
end $$;

-- A cannot make themselves admin
do $$ begin
  begin
    update public.profiles set role = 'admin' where id = '11111111-1111-1111-1111-111111111111';
    raise exception 'role escalation should fail';
  exception when insufficient_privilege then null;
  end;
end $$;
update public.profiles set full_name = 'Alice' where id = '11111111-1111-1111-1111-111111111111';

-- A cannot modify sources or read the queue
do $$ begin
  update public.job_sources set enabled = false;
  assert (select count(*) from public.job_sources where not enabled) = 1, 'non-admin must not disable sources (only seeded Remotive is disabled)';
  assert (select count(*) from public.task_queue) = 0, 'queue hidden from users';
end $$;

-- A cannot call service functions
do $$ begin
  begin
    perform public.claim_tasks(1);
    raise exception 'claim_tasks should not be callable';
  exception when insufficient_privilege then null;
  end;
end $$;

-- storage: own folder only
insert into storage.objects (bucket_id, name) values ('resumes', '11111111-1111-1111-1111-111111111111/r.pdf');
do $$ begin
  begin
    insert into storage.objects (bucket_id, name) values ('resumes', '22222222-2222-2222-2222-222222222222/r.pdf');
    raise exception 'upload into another user folder should fail';
  exception when others then if sqlerrm like '%row-level security%' then null; else raise; end if;
  end;
end $$;

-- user B sees nothing of A
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$ begin
  assert (select count(*) from public.candidate_skills) = 0, 'B must not see A skills';
  assert (select count(*) from storage.objects) = 0, 'B must not see A files';
  assert (select full_name from public.profiles where id = '11111111-1111-1111-1111-111111111111') is null, 'B must not read A profile';
end $$;

-- admin can manage sources
reset role;
update public.profiles set role = 'admin' where id = '22222222-2222-2222-2222-222222222222';
set local role authenticated;
do $$ begin
  update public.job_sources set min_interval_minutes = 120 where slug = 'gh-gitlab';
  assert (select min_interval_minutes from public.job_sources where slug = 'gh-gitlab') = 120, 'admin should edit sources';
end $$;

-- queue: dedupe + claim (as service role)
reset role;
set local role service_role;
do $$ declare a uuid; b uuid; n int; begin
  a := public.enqueue_task('match_user', '{"user_id":"x"}', 'match:x');
  b := public.enqueue_task('match_user', '{"user_id":"x"}', 'match:x');
  assert a is not null and b is null, 'dedupe key should prevent duplicate queued task';
  select count(*) into n from public.claim_tasks(5);
  assert n = 1, 'claim should return the queued task';
  select count(*) into n from public.claim_tasks(5);
  assert n = 0, 'claimed task should not be claimed twice';
end $$;

-- account deletion cascades
reset role;
delete from auth.users where id = '11111111-1111-1111-1111-111111111111';
do $$ begin
  assert (select count(*) from public.candidate_skills) = 0, 'skills should cascade';
  assert (select count(*) from public.profiles) = 1, 'profile should cascade';
end $$;

rollback;
\echo 'RLS tests passed'
