import type { Metadata } from "next";
import Link from "next/link";
import { removeApplication, setApplicationStatus } from "@/app/actions/jobs";
import { SubmitButton } from "@/components/submit-button";
import { cx, EmptyState, LinkButton, PageHeader, Panel, Tag } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { shortDate, STATUS_LABEL } from "@/lib/format";
import { NO_RESPONSE_AFTER_DAYS } from "@/lib/services/worker";

export const metadata: Metadata = { title: "My applications" };

const COLUMNS: { key: string; label: string; statuses: string[] }[] = [
  { key: "planning", label: "Interested", statuses: ["saved", "interested"] },
  { key: "preparing", label: "Preparing", statuses: ["preparing"] },
  { key: "applied", label: "Applied", statuses: ["applied"] },
  { key: "interview", label: "Interviewing", statuses: ["interview", "offer"] },
  { key: "closed", label: "Closed", statuses: ["rejected", "withdrawn", "no_response", "closed"] },
];

type App = {
  job_id: string;
  status: string;
  applied_at: string | null;
  notes: string | null;
  updated_at: string;
  auto_closed_at: string | null;
  auto_closed_reason: string | null;
  tailored_application_id: string | null;
  jobs: { title: string; employer_name: string; apply_url: string | null; is_active: boolean };
};

const daysSince = (iso: string | null) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : null);

export default async function ApplicationsPage() {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("applications")
    .select("job_id, status, applied_at, notes, updated_at, auto_closed_at, auto_closed_reason, tailored_application_id, jobs(title, employer_name, apply_url, is_active)")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });
  const apps = (data ?? []) as unknown as App[];

  const applied = apps.filter((a) => a.status === "applied");
  const waitingLong = applied.filter((a) => (daysSince(a.applied_at) ?? 0) >= 14).length;
  const interviewing = apps.filter((a) => a.status === "interview" || a.status === "offer").length;
  const closedListings = applied.filter((a) => !a.jobs.is_active).length;

  return (
    <>
      <PageHeader
        title="My applications"
        description={`Every job you're working on or have applied to. If you hear nothing ${NO_RESPONSE_AFTER_DAYS} days after applying, we move it to "No response" so you can stop waiting. You can move it back any time.`}
      />
      {apps.length === 0 ? (
        <EmptyState title="No applications yet" action={<LinkButton href="/jobs">Find a job that fits</LinkButton>}>
          When you prepare an application or mark a job as applied, it appears here.
        </EmptyState>
      ) : (
        <>
          <section className="mb-8 grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-line bg-line sm:grid-cols-4">
            {[
              { n: applied.length, l: "Applied, waiting to hear" },
              { n: waitingLong, l: "Waiting 2+ weeks" },
              { n: interviewing, l: "Interviewing or offer" },
              { n: closedListings, l: "Applied, listing now closed" },
            ].map((s) => (
              <div key={s.l} className="bg-surface px-5 py-4">
                <span className="block text-[26px] leading-none font-bold num">{s.n}</span>
                <span className="mt-1.5 block text-[13.5px] text-ink-2">{s.l}</span>
              </div>
            ))}
          </section>

          <div className="grid gap-4 lg:grid-cols-5">
            {COLUMNS.map((col) => {
              const items = apps.filter((a) => col.statuses.includes(a.status));
              return (
                <section key={col.key} aria-labelledby={`col-${col.key}`} className="flex flex-col gap-2">
                  <h2 id={`col-${col.key}`} className="flex items-baseline justify-between px-1 text-[14.5px] font-bold">
                    {col.label}
                    <span className="font-normal text-ink-3 num">{items.length}</span>
                  </h2>
                  {items.map((a) => {
                    const waited = daysSince(a.applied_at);
                    const left = waited != null ? NO_RESPONSE_AFTER_DAYS - waited : null;
                    return (
                      <Panel key={a.job_id} as="article" className={cx("p-3.5", col.key === "closed" && "opacity-80")}>
                        <Link href={`/jobs/${a.job_id}`} className="block leading-snug font-semibold hover:underline">{a.jobs.title}</Link>
                        <p className="text-[13.5px] text-ink-2">{a.jobs.employer_name}</p>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {col.key === "closed" ? <Tag tone={a.status === "rejected" ? "block" : "low"}>{STATUS_LABEL[a.status]}</Tag> : null}
                          {a.status === "offer" ? <Tag tone="strong">Offer</Tag> : null}
                          {!a.jobs.is_active && a.status !== "closed" ? <Tag tone="possible">Job closed on their site</Tag> : null}
                        </div>
                        <p className="mt-1.5 text-[12.5px] text-ink-3">
                          {a.status === "applied" && a.applied_at ? (
                            <>
                              Applied {shortDate(a.applied_at)}, waiting {waited} day{waited === 1 ? "" : "s"}.
                              {left != null && left > 0 ? ` Moves to No response in ${left} day${left === 1 ? "" : "s"} unless you update it.` : ""}
                            </>
                          ) : a.auto_closed_reason ? (
                            <>{a.auto_closed_reason}. Still in touch with them? Change the status below.</>
                          ) : a.applied_at ? (
                            <>Applied {shortDate(a.applied_at)}</>
                          ) : (
                            <>Updated {shortDate(a.updated_at)}</>
                          )}
                        </p>
                        <form action={setApplicationStatus} className="mt-2.5 flex gap-1.5">
                          <input type="hidden" name="jobId" value={a.job_id} />
                          <select name="status" defaultValue={a.status} aria-label="Status" className="h-8 min-w-0 flex-1 rounded border border-line-strong bg-surface px-1.5 text-[13px]">
                            {Object.entries(STATUS_LABEL).map(([v, l]) => (
                              <option key={v} value={v}>{l}</option>
                            ))}
                          </select>
                          <SubmitButton variant="secondary" className="h-8 px-2 text-[12.5px]" pending="…">Save</SubmitButton>
                        </form>
                        <div className="mt-2 flex gap-3 text-[12.5px]">
                          <Link href={`/jobs/${a.job_id}/apply`} className="underline underline-offset-2">{a.tailored_application_id ? "Open builder" : "Prepare"}</Link>
                          <form action={removeApplication}>
                            <input type="hidden" name="jobId" value={a.job_id} />
                            <button className="text-ink-3 hover:text-block">Remove</button>
                          </form>
                        </div>
                      </Panel>
                    );
                  })}
                </section>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
