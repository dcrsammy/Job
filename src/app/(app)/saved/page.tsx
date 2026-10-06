import type { Metadata } from "next";
import { JobList, JobRow, JOB_ROW_SELECT, type JobRowData, type MatchRowData } from "@/components/job-row";
import { EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Saved jobs" };

export default async function SavedPage() {
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("saved_jobs").select(`job_id, created_at, jobs!inner(${JOB_ROW_SELECT})`).eq("user_id", user.id).eq("saved", true).order("created_at", { ascending: false });
  const ids = (data ?? []).map((d) => d.job_id);
  const { data: matches } = ids.length ? await supabase.from("job_matches").select("job_id, score, band, reasons, gaps, disqualifiers, breakdown").eq("user_id", user.id).in("job_id", ids) : { data: [] };
  const matchBy = new Map((matches ?? []).map((m) => [m.job_id, m as MatchRowData]));
  const rows = (data ?? []).sort((a, b) => {
    const da = (a.jobs as unknown as JobRowData).deadline_at ?? "9999";
    const db = (b.jobs as unknown as JobRowData).deadline_at ?? "9999";
    return da.localeCompare(db);
  });
  return (
    <>
      <PageHeader title="Saved jobs" description="Sorted by closing date, soonest first." />
      {rows.length ? (
        <JobList>
          {rows.map((r) => (
            <JobRow key={r.job_id} job={r.jobs as unknown as JobRowData} match={matchBy.get(r.job_id) ?? null} saved />
          ))}
        </JobList>
      ) : (
        <EmptyState title="No saved jobs" action={<LinkButton href="/jobs">See recommendations</LinkButton>}>
          Save jobs you want to come back to. They'll stay here even if you hide them from recommendations.
        </EmptyState>
      )}
    </>
  );
}
