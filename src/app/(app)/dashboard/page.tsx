import type { Metadata } from "next";
import Link from "next/link";
import { JobList, JobRow, JOB_ROW_SELECT, type JobRowData } from "@/components/job-row";
import { EmptyState, LinkButton, Notice, PageHeader, Panel, SectionTitle } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { relativeDate, shortDate, STATUS_LABEL } from "@/lib/format";
import { interactions, recommended } from "@/lib/queries";
import { loadCandidate, profileCompleteness } from "@/lib/services/candidate";

export const metadata: Metadata = { title: "Overview" };

const ACTIVITY: Record<string, string> = {
  "account.created": "Created your account",
  "resume.uploaded": "Uploaded a resume",
  "resume.parsed": "Resume analysed",
  "resume.deleted": "Deleted a resume file",
  "profile.confirmed": "Confirmed your profile",
  "job.saved": "Saved a job",
  "application.generated": "Prepared an application",
  "application.reviewed": "Finished an application checklist",
  "application.applied": "Marked a job as applied",
  "application.status": "Updated an application",
  "data.exported": "Downloaded your data",
  "plan.requested": "Asked for a plan upgrade",
  "plan.changed": "Your plan changed",
  "plan.downgraded": "Switched to Basic",
  "premium.interview_prep": "Prepared for an interview",
  "premium.follow_up": "Drafted a follow-up email",
};

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ password?: string }> }) {
  const { supabase, user } = await requireUser();
  const sp = await searchParams;
  const full = await loadCandidate(supabase, user.id);
  const hasResume = !!full?.profile.source_resume_id;
  const confirmed = !!full?.profile.confirmed_at;

  const [{ rows: top }, strong, possible, { data: apps }, { data: savedRows }, { data: activity }, { saved }] = await Promise.all([
    confirmed ? recommended(supabase, user.id, { eligibleOnly: true, limit: 3 }) : Promise.resolve({ rows: [], total: 0 }),
    supabase.from("job_matches").select("job_id, jobs!inner(is_active)", { count: "exact", head: true }).eq("user_id", user.id).eq("band", "high").eq("disqualifiers", "{}").eq("jobs.is_active", true),
    supabase.from("job_matches").select("job_id, jobs!inner(is_active)", { count: "exact", head: true }).eq("user_id", user.id).eq("band", "possible").eq("disqualifiers", "{}").eq("jobs.is_active", true),
    supabase.from("applications").select("status").eq("user_id", user.id),
    supabase.from("saved_jobs").select(`job_id, jobs!inner(${JOB_ROW_SELECT})`).eq("user_id", user.id).eq("saved", true).not("jobs.deadline_at", "is", null).gte("jobs.deadline_at", new Date().toISOString()).limit(5),
    supabase.from("audit_logs").select("action, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(6),
    interactions(supabase, user.id),
  ]);

  const byStatus = (apps ?? []).reduce<Record<string, number>>((acc, a) => ((acc[a.status] = (acc[a.status] ?? 0) + 1), acc), {});
  const completeness = full ? profileCompleteness(full) : { percent: 0, missing: [] };
  const firstName = (full?.fullName ?? "").split(" ")[0];

  return (
    <>
      <PageHeader title={firstName ? `Hello, ${firstName}` : "Overview"} description={confirmed ? "Here's where you fit right now." : undefined} />
      {sp.password === "updated" ? (
        <div className="mb-6">
          <Notice tone="ok">Your password has been changed.</Notice>
        </div>
      ) : null}

      {!hasResume ? (
        <EmptyState title="Start with your resume" action={<LinkButton href="/resume">Upload resume</LinkButton>}>
          We'll read it, build your career profile, and rank live remote jobs by how well you fit. Nothing is shared with employers.
        </EmptyState>
      ) : !confirmed ? (
        <EmptyState title="Check your profile, then see your matches" action={<LinkButton href="/profile">Review profile</LinkButton>}>
          We've read your resume. Confirm what we found, and add where you can work, so we only show jobs you're eligible for.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-10">
          <section className="grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-line bg-line sm:grid-cols-4">
            {[
              { n: strong.count ?? 0, label: "Strong matches", href: "/jobs?band=high" },
              { n: possible.count ?? 0, label: "Possible matches", href: "/jobs?band=possible" },
              { n: (byStatus.preparing ?? 0) + (byStatus.interested ?? 0), label: "Applications in progress", href: "/applications" },
              { n: (byStatus.applied ?? 0) + (byStatus.interview ?? 0) + (byStatus.offer ?? 0), label: "Sent", href: "/applications" },
            ].map((s) => (
              <Link key={s.label} href={s.href} className="bg-surface px-5 py-4 hover:bg-paper">
                <span className="block text-[30px] leading-none font-bold num">{s.n}</span>
                <span className="mt-1.5 block text-[14px] text-ink-2">{s.label}</span>
              </Link>
            ))}
          </section>

          <section>
            <SectionTitle aside={<Link href="/jobs" className="text-[14px] font-semibold underline underline-offset-2">All recommendations</Link>}>Best fits right now</SectionTitle>
            {top.length ? (
              <JobList>
                {top.map((r) => (
                  <JobRow key={r.job_id} job={r.jobs} match={r} saved={saved.has(r.job_id)} />
                ))}
              </JobList>
            ) : (
              <EmptyState title="No eligible matches yet">New jobs are added several times a day. Adding more skills to your profile helps too.</EmptyState>
            )}
          </section>

          <div className="grid gap-8 lg:grid-cols-3">
            <section>
              <SectionTitle>Profile</SectionTitle>
              <Panel className="p-5">
                <div className="flex items-baseline justify-between">
                  <span className="text-[24px] font-bold num">{completeness.percent}%</span>
                  <span className="text-[13.5px] text-ink-3">complete</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken" aria-hidden>
                  <div className="h-full bg-ink" style={{ width: `${completeness.percent}%` }} />
                </div>
                {completeness.missing.length ? (
                  <ul className="mt-3 space-y-1 text-[14px] text-ink-2">
                    {completeness.missing.slice(0, 3).map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                ) : null}
                <Link href="/profile" className="mt-3 inline-block text-[14px] font-semibold underline underline-offset-2">Edit profile</Link>
              </Panel>
            </section>
            <section>
              <SectionTitle>Deadlines</SectionTitle>
              <Panel className="p-5">
                {savedRows?.length ? (
                  <ul className="space-y-3">
                    {savedRows.map((s) => {
                      const j = s.jobs as unknown as JobRowData;
                      return (
                        <li key={s.job_id}>
                          <Link href={`/jobs/${s.job_id}`} className="font-semibold hover:underline">{j.title}</Link>
                          <p className="text-[13.5px] text-ink-2">
                            {j.employer_name}. Closes {shortDate(j.deadline_at)} ({relativeDate(j.deadline_at)})
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-[14px] text-ink-2">Saved jobs with a closing date appear here.</p>
                )}
              </Panel>
            </section>
            <section>
              <SectionTitle>Recent activity</SectionTitle>
              <Panel className="p-5">
                <ul className="space-y-2 text-[14px]">
                  {(activity ?? []).map((a, i) => (
                    <li key={i} className="flex justify-between gap-3">
                      <span>{ACTIVITY[a.action] ?? a.action}</span>
                      <span className="shrink-0 text-ink-3">{relativeDate(a.created_at)}</span>
                    </li>
                  ))}
                </ul>
                {Object.keys(byStatus).length ? (
                  <p className="mt-4 border-t border-line pt-3 text-[13.5px] text-ink-2">
                    {Object.entries(byStatus)
                      .map(([s, n]) => `${STATUS_LABEL[s]} ${n}`)
                      .join(", ")}
                  </p>
                ) : null}
              </Panel>
            </section>
          </div>
        </div>
      )}
    </>
  );
}
