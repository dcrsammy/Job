import type { Metadata } from "next";
import { JobList, JobRow, JOB_ROW_SELECT, type JobRowData, type MatchRowData } from "@/components/job-row";
import { Button, EmptyState, Input, LinkButton, PageHeader, Select } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { interactions } from "@/lib/queries";

export const metadata: Metadata = { title: "Search jobs" };

const PAGE = 25;

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; remote?: string; source?: string; days?: string; page?: string }> }) {
  const { supabase, user } = await requireUser();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 120);
  const remote = ["remote", "hybrid", "onsite"].includes(sp.remote ?? "") ? sp.remote! : "";
  const source = ["official", "third_party"].includes(sp.source ?? "") ? sp.source! : "";
  const days = [7, 30, 90].includes(Number(sp.days)) ? Number(sp.days) : 0;
  const page = Math.max(1, Number(sp.page) || 1);

  let query = supabase.from("jobs").select(JOB_ROW_SELECT, { count: "exact" }).eq("is_active", true).is("duplicate_of", null);
  if (q) query = query.textSearch("search", q, { type: "websearch", config: "english" });
  if (remote) query = query.eq("remote_type", remote);
  if (source) query = query.eq("verification_status", source);
  if (days) query = query.gte("posted_at", new Date(Date.now() - days * 86_400_000).toISOString());
  query = query.order("posted_at", { ascending: false, nullsFirst: false }).range((page - 1) * PAGE, page * PAGE - 1);
  const [{ data: jobs, count }, { saved, hidden }] = await Promise.all([query, interactions(supabase, user.id)]);

  const ids = (jobs ?? []).map((j) => j.id);
  const { data: matches } = ids.length ? await supabase.from("job_matches").select("job_id, score, band, reasons, gaps, disqualifiers, breakdown").eq("user_id", user.id).in("job_id", ids) : { data: [] };
  const matchBy = new Map((matches ?? []).map((m) => [m.job_id, m as MatchRowData & { job_id: string }]));
  const rows = ((jobs ?? []) as unknown as JobRowData[]).filter((j) => !hidden.has(j.id));
  const qs = (p: number) => `/search?${new URLSearchParams({ ...(q && { q }), ...(remote && { remote }), ...(source && { source }), ...(days && { days: String(days) }), page: String(p) })}`;

  return (
    <>
      <PageHeader title="Search jobs" description="Search every live listing. Jobs we haven't scored for you yet show a score once you open them." />
      <form className="mb-6 grid gap-3 sm:grid-cols-[1fr_auto_auto_auto_auto]" role="search">
        <Input name="q" defaultValue={q} placeholder="Job title, skill or company" aria-label="Search" />
        <Select name="remote" defaultValue={remote} aria-label="Work arrangement">
          <option value="">Any arrangement</option>
          <option value="remote">Remote</option>
          <option value="hybrid">Hybrid</option>
          <option value="onsite">On-site</option>
        </Select>
        <Select name="source" defaultValue={source} aria-label="Source">
          <option value="">All sources</option>
          <option value="official">Employer's own listings</option>
          <option value="third_party">Job boards</option>
        </Select>
        <Select name="days" defaultValue={days ? String(days) : ""} aria-label="Posted within">
          <option value="">Any date</option>
          <option value="7">Past week</option>
          <option value="30">Past month</option>
          <option value="90">Past 3 months</option>
        </Select>
        <Button type="submit">Search</Button>
      </form>
      <p className="mb-3 text-[14px] text-ink-3 num">{count ?? 0} jobs</p>
      {rows.length ? (
        <JobList>
          {rows.map((j) => (
            <JobRow key={j.id} job={j} match={matchBy.get(j.id) ?? null} saved={saved.has(j.id)} />
          ))}
        </JobList>
      ) : (
        <EmptyState title="No jobs found">Try fewer words, or remove a filter.</EmptyState>
      )}
      <div className="mt-6 flex justify-center gap-2">
        {page > 1 ? <LinkButton variant="secondary" href={qs(page - 1)}>Previous</LinkButton> : null}
        {(count ?? 0) > page * PAGE ? <LinkButton variant="secondary" href={qs(page + 1)}>Next</LinkButton> : null}
      </div>
    </>
  );
}
