import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, LinkButton, PageHeader, Panel, Tag } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { relativeDate } from "@/lib/format";

export const metadata: Metadata = { title: "Application builder" };

export default async function BuilderIndex() {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("tailored_applications")
    .select("id, job_id, status, updated_at, fabrication_warnings, jobs(title, employer_name)")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });
  const rows = (data ?? []) as unknown as { id: string; job_id: string; status: string; updated_at: string; fabrication_warnings: unknown[]; jobs: { title: string; employer_name: string } }[];
  return (
    <>
      <PageHeader title="Application builder" description="Tailored resumes, cover letters and answers you've prepared. Open one to edit, check and export it." />
      {rows.length ? (
        <Panel as="div" className="divide-y divide-line">
          {rows.map((r) => (
            <div key={r.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <Link href={`/jobs/${r.job_id}/apply`} className="font-semibold hover:underline">{r.jobs.title}</Link>
                <p className="text-[14px] text-ink-2">{r.jobs.employer_name}. Updated {relativeDate(r.updated_at)}</p>
              </div>
              <div className="flex items-center gap-2">
                {r.fabrication_warnings?.length ? <Tag tone="possible">{r.fabrication_warnings.length} to review</Tag> : null}
                <Tag tone={r.status === "draft" ? "neutral" : "strong"}>{r.status === "draft" ? "Draft" : r.status === "reviewed" ? "Checked" : "Exported"}</Tag>
                <LinkButton href={`/jobs/${r.job_id}/apply`} variant="secondary" className="h-9">Open</LinkButton>
              </div>
            </div>
          ))}
        </Panel>
      ) : (
        <EmptyState title="Nothing prepared yet" action={<LinkButton href="/jobs">Choose a job</LinkButton>}>
          Pick a job from your recommendations and select “Prepare application”.
        </EmptyState>
      )}
    </>
  );
}
