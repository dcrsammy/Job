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
