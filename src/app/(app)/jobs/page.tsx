import type { Metadata } from "next";
import Link from "next/link";
import { refreshMatches } from "@/app/actions/jobs";
import { JobList, JobRow } from "@/components/job-row";
import { SubmitButton } from "@/components/submit-button";
import { cx, EmptyState, LinkButton, Notice, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { interactions, recommended } from "@/lib/queries";

export const metadata: Metadata = { title: "Recommended jobs" };

const TABS = [
  { key: "high", label: "Strong matches" },
  { key: "possible", label: "Possible" },
  { key: "low", label: "Low fit" },
  { key: "all", label: "All" },
] as const;

export default async function JobsPage({ searchParams }: { searchParams: Promise<{ band?: string; page?: string; from?: string; eligible?: string }> }) {
  const { supabase, user } = await requireUser();
  const sp = await searchParams;
  const band = (TABS.find((t) => t.key === sp.band)?.key ?? "high") as (typeof TABS)[number]["key"];
  const page = Math.max(1, Number(sp.page) || 1);
  const eligibleOnly = sp.eligible !== "0";

  const [{ data: profile }, { saved, hidden }, counts] = await Promise.all([
    supabase.from("candidate_profiles").select("confirmed_at").eq("user_id", user.id).single(),
    interactions(supabase, user.id),
    Promise.all(
      (["high", "possible", "low"] as const).map(async (b) => {
        const { count } = await supabase.from("job_matches").select("job_id, jobs!inner(is_active)", { count: "exact", head: true }).eq("user_id", user.id).eq("band", b).eq("jobs.is_active", true);
        return [b, count ?? 0] as const;
      }),
    ),
  ]);
  const countBy = Object.fromEntries(counts) as Record<string, number>;

  if (!profile?.confirmed_at) {
    return (
      <>
        <PageHeader title="Recommended jobs" />
        <EmptyState title="Confirm your profile to see matches" action={<LinkButton href="/profile">Review my profile</LinkButton>}>
          We match jobs to your confirmed profile, so we only use details you've checked.
        </EmptyState>
      </>
    );
  }

  const { rows, total } = await recommended(supabase, user.id, { band: band === "all" ? undefined : band, eligibleOnly: band !== "low" && eligibleOnly, limit: 30, offset: (page - 1) * 30 });
  const visible = rows.filter((r) => !hidden.has(r.job_id));

  return (
    <>
      <PageHeader
        title="Recommended jobs"
        description="Ranked by how well your profile fits each role. Open any job to see exactly how its score was worked out."
        actions={
          <form action={refreshMatches}>
            <SubmitButton variant="secondary" pending="Refreshing…">Refresh matches</SubmitButton>
          </form>
        }
      />
      {sp.from === "profile" ? (
        <div className="mb-5">
          <Notice tone="ok">Your profile is confirmed. These matches update automatically when new jobs come in.</Notice>
        </div>
      ) : null}
      <nav aria-label="Match level" className="mb-4 flex flex-wrap gap-1 border-b border-line">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/jobs?band=${t.key}`}
            aria-current={band === t.key ? "page" : undefined}
            className={cx("-mb-px border-b-2 px-3 pb-2.5 text-[14.5px]", band === t.key ? "border-ink font-semibold text-ink" : "border-transparent text-ink-2 hover:text-ink")}
          >
            {t.label}
            {t.key !== "all" ? <span className="ml-1.5 text-ink-3 num">{countBy[t.key] ?? 0}</span> : null}
          </Link>
        ))}
      </nav>
      {band !== "low" ? (
        <p className="mb-4 text-[13.5px] text-ink-3">
          {eligibleOnly ? "Jobs you're not eligible for are hidden. " : "Showing jobs you may not be eligible for. "}
          <Link className="underline underline-offset-2" href={`/jobs?band=${band}&eligible=${eligibleOnly ? "0" : "1"}`}>
            {eligibleOnly ? "Show them" : "Hide them"}
          </Link>
        </p>
      ) : null}
      {visible.length ? (
        <JobList>
          {visible.map((r) => (
            <JobRow key={r.job_id} job={r.jobs} match={r} saved={saved.has(r.job_id)} />
          ))}
        </JobList>
      ) : (
        <EmptyState
          title={band === "high" ? "No strong matches yet" : "Nothing here"}
          action={<LinkButton href="/jobs?band=possible" variant="secondary">See possible matches</LinkButton>}
        >
          {band === "high"
            ? "New jobs arrive several times a day. Adding skills and work authorisation to your profile can also reveal more matches."
            : "Try another tab or search all jobs."}
        </EmptyState>
      )}
      {total > page * 30 ? (
        <div className="mt-6 flex justify-center">
          <LinkButton variant="secondary" href={`/jobs?band=${band}&page=${page + 1}${eligibleOnly ? "" : "&eligible=0"}`}>Show more</LinkButton>
        </div>
      ) : null}
    </>
  );
}
