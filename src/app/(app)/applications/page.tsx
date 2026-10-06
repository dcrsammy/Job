import type { Metadata } from "next";
import Link from "next/link";
import { removeApplication, setApplicationStatus } from "@/app/actions/jobs";
import { SubmitButton } from "@/components/submit-button";
import { EmptyState, LinkButton, PageHeader, Panel } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { shortDate, STATUS_LABEL } from "@/lib/format";

export const metadata: Metadata = { title: "My applications" };

const COLUMNS: { key: string; label: string; statuses: string[] }[] = [
  { key: "planning", label: "Interested", statuses: ["saved", "interested"] },
  { key: "preparing", label: "Preparing", statuses: ["preparing"] },
  { key: "applied", label: "Applied", statuses: ["applied"] },
  { key: "interview", label: "Interviewing", statuses: ["interview"] },
  { key: "closed", label: "Outcome", statuses: ["offer", "rejected", "withdrawn"] },
];

export default async function ApplicationsPage() {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("applications")
    .select("job_id, status, applied_at, notes, updated_at, tailored_application_id, jobs(title, employer_name, apply_url, is_active)")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });
  const apps = (data ?? []) as unknown as {
    job_id: string;
    status: string;
    applied_at: string | null;
    notes: string | null;
    updated_at: string;
    tailored_application_id: string | null;
    jobs: { title: string; employer_name: string; apply_url: string | null; is_active: boolean };
  }[];

  return (
    <>
      <PageHeader title="My applications" description="Track every role from first interest to outcome. Update the status as things move." />
      {apps.length === 0 ? (
        <EmptyState title="No applications yet" action={<LinkButton href="/jobs">Find a job that fits</LinkButton>}>
          When you prepare an application or mark a job as applied, it appears here.
        </EmptyState>
      ) : (
        <div className="grid gap-4 lg:grid-cols-5">
          {COLUMNS.map((col) => {
            const items = apps.filter((a) => col.statuses.includes(a.status));
            return (
              <section key={col.key} aria-labelledby={`col-${col.key}`} className="flex flex-col gap-2">
                <h2 id={`col-${col.key}`} className="flex items-baseline justify-between px-1 text-[14.5px] font-bold">
                  {col.label}
                  <span className="font-normal text-ink-3 num">{items.length}</span>
                </h2>
                {items.map((a) => (
                  <Panel key={a.job_id} as="article" className="p-3.5">
                    <Link href={`/jobs/${a.job_id}`} className="block leading-snug font-semibold hover:underline">{a.jobs.title}</Link>
                    <p className="text-[13.5px] text-ink-2">{a.jobs.employer_name}</p>
                    <p className="mt-1 text-[12.5px] text-ink-3">
                      {a.applied_at ? `Applied ${shortDate(a.applied_at)}` : `Updated ${shortDate(a.updated_at)}`}
                      {!a.jobs.is_active ? ". Listing closed" : ""}
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
                ))}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
