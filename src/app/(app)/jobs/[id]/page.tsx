import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { hideJob, saveJob, setApplicationStatus } from "@/app/actions/jobs";
import { JobDescription } from "@/components/job-description";
import { SourceLabel, JOB_ROW_SELECT, type JobRowData } from "@/components/job-row";
import { MatchBreakdown } from "@/components/match-breakdown";
import { SubmitButton } from "@/components/submit-button";
import { ExternalButton, LinkButton, Notice, Panel, SectionTitle, Tag } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatSalary, relativeDate, remoteLabel, shortDate, STATUS_LABEL } from "@/lib/format";
import { describeFlag } from "@/lib/jobs/verify";
import { skillDisplayName } from "@/lib/skills/taxonomy";
import { createAdminClient } from "@/lib/supabase/admin";
import { matchToRow, scoreSingleJob } from "@/lib/services/matching";
import type { ComponentScore } from "@/lib/types";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const { supabase } = await requireUser();
  const { data } = await supabase.from("jobs").select("title, employer_name").eq("id", id).maybeSingle();
  return { title: data ? `${data.title} at ${data.employer_name}` : "Job" };
}

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase, user } = await requireUser();

  const [{ data: job, error: jobError }, { data: storedMatch }, { data: interaction }, { data: application }, { data: reqs }] = await Promise.all([
    supabase.from("jobs").select(`${JOB_ROW_SELECT.replace("job_sources(name, kind, is_official)", "job_sources(name, kind, is_official, attribution)")}, description_text, source_url, employment_type, department, is_active, duplicate_of`).eq("id", id).maybeSingle(),
    supabase.from("job_matches").select("score, band, reasons, gaps, disqualifiers, uncertain, breakdown").eq("user_id", user.id).eq("job_id", id).maybeSingle(),
    supabase.from("saved_jobs").select("id, saved, hidden").eq("user_id", user.id).eq("job_id", id).maybeSingle(),
    supabase.from("applications").select("status").eq("user_id", user.id).eq("job_id", id).maybeSingle(),
    supabase.from("job_requirements").select("kind, text, normalized, importance").eq("job_id", id),
  ]);
  if (jobError) throw new Error(`Could not load job: ${jobError.message}`);
  if (!job) notFound();

  // Record that the job was viewed.
  if (interaction) await supabase.from("saved_jobs").update({ viewed_at: new Date().toISOString() }).eq("id", interaction.id);
  else await supabase.from("saved_jobs").insert({ user_id: user.id, job_id: id, viewed_at: new Date().toISOString() });

  let match = storedMatch as null | { score: number; band: string; reasons: string[]; gaps: string[]; disqualifiers: string[]; uncertain: string[]; breakdown: { label: string; components: ComponentScore[]; adjustments?: string[] } };
  if (!match) {
    const m = await scoreSingleJob(supabase, user.id, id);
    if (m) {
      await createAdminClient().from("job_matches").upsert(matchToRow(user.id, id, m), { onConflict: "user_id,job_id" });
      match = { score: m.score, band: m.band, reasons: m.reasons, gaps: m.gaps, disqualifiers: m.disqualifiers, uncertain: m.uncertain, breakdown: { label: m.label, components: m.components, adjustments: m.adjustments } };
    }
  }

  const j = job as unknown as JobRowData & { description_text: string; source_url: string | null; employment_type: string | null; department: string | null; is_active: boolean; job_sources: { name: string; kind: string; is_official: boolean; attribution: string | null } | null };
  const salary = formatSalary(j.salary_min, j.salary_max, j.salary_currency, j.salary_period);
  const skillReqs = (reqs ?? []).filter((r) => r.kind === "skill");
  const otherReqs = (reqs ?? []).filter((r) => r.kind !== "skill");
  const flags = j.verification_flags.filter((f) => f !== "third_party_link");

  return (
    <>
      <p className="mb-4 text-[14px]">
        <Link href="/jobs" className="text-ink-2 underline-offset-2 hover:underline">Recommended jobs</Link>
      </p>
      <header className="mb-8">
        <h1 className="text-[30px] leading-tight font-bold tracking-[-0.015em]">{j.title}</h1>
        <p className="mt-1 text-[17px] text-ink-2">{j.employer_name}</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[14px] text-ink-2">
          <span>{remoteLabel(j.remote_type, j.remote_regions)}</span>
          {j.location_raw ? <span>{j.location_raw}</span> : null}
          {j.employment_type ? <span>{j.employment_type.replace(/_/g, " ")}</span> : null}
          {salary ? <span className="font-semibold text-ink num">{salary}</span> : null}
          {j.posted_at ? <span>Posted {shortDate(j.posted_at)}</span> : null}
          {j.deadline_at ? <span className="font-semibold text-ink">Closes {shortDate(j.deadline_at)} ({relativeDate(j.deadline_at)})</span> : null}
          <SourceLabel job={j} />
          {application ? <Tag tone="tape">{STATUS_LABEL[application.status]}</Tag> : null}
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <LinkButton href={`/jobs/${id}/apply`}>Prepare application</LinkButton>
          {j.apply_url ? (
            <ExternalButton href={j.apply_url} variant="secondary">
              {j.verification_status === "official" ? "Open the employer's application page" : `Open on ${j.job_sources?.name ?? "the job board"}`}
            </ExternalButton>
          ) : null}
          <form action={saveJob}>
            <input type="hidden" name="jobId" value={id} />
            <input type="hidden" name="value" value={interaction?.saved ? "false" : "true"} />
            <SubmitButton variant="ghost" pending="Saving…">{interaction?.saved ? "Saved" : "Save"}</SubmitButton>
          </form>
          <form action={hideJob}>
            <input type="hidden" name="jobId" value={id} />
            <input type="hidden" name="value" value={interaction?.hidden ? "false" : "true"} />
            <SubmitButton variant="ghost" pending="…">{interaction?.hidden ? "Unhide" : "Hide"}</SubmitButton>
          </form>
        </div>
      </header>

      <div className="mb-6 flex flex-col gap-3">
        {!j.is_active ? <Notice tone="warn">This listing is no longer on the source site. It has probably closed.</Notice> : null}
        {flags.length ? (
          <Notice tone={j.verification_status === "flagged" ? "error" : "warn"}>
            <ul className="list-disc pl-5">
              {flags.map((f) => (
                <li key={f}>{describeFlag(f)}</li>
              ))}
            </ul>
            {j.verification_status === "flagged" ? <p className="mt-2">Never pay to apply, and don't share bank or ID details before a real interview.</p> : null}
          </Notice>
        ) : null}
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="order-2 lg:order-1">
          <SectionTitle>About the role</SectionTitle>
          <JobDescription text={j.description_text} />
          <p className="mt-8 border-t border-line pt-4 text-[13.5px] text-ink-3">
            Source: {j.job_sources?.name}
            {j.job_sources?.attribution ? `. ${j.job_sources.attribution}` : ""}.{" "}
            {j.source_url ? (
              <a href={j.source_url} target="_blank" rel="noopener" className="underline underline-offset-2">View the original listing</a>
            ) : null}
          </p>
        </div>
        <aside className="order-1 flex flex-col gap-6 lg:order-2">
          <Panel className="p-5">
            <SectionTitle>Your fit</SectionTitle>
            {match ? (
              <MatchBreakdown
                score={match.score}
                band={match.band}
                label={match.breakdown.label}
                components={match.breakdown.components}
                reasons={match.reasons}
                gaps={match.gaps}
                disqualifiers={match.disqualifiers}
                uncertain={match.uncertain}
                adjustments={match.breakdown.adjustments ?? []}
              />
            ) : (
              <p className="text-ink-2">
                <Link href="/resume" className="underline underline-offset-2">Upload your resume</Link> to see how you fit.
              </p>
            )}
          </Panel>
          <Panel className="p-5">
            <SectionTitle>What the listing asks for</SectionTitle>
            {skillReqs.length ? (
              <div className="mb-4">
                <h3 className="mb-2 text-[14px] font-semibold">Skills</h3>
                <ul className="flex flex-wrap gap-1.5">
                  {skillReqs
                    .sort((a, b) => (a.importance === b.importance ? 0 : a.importance === "required" ? -1 : 1))
                    .map((r) => (
                      <li key={r.normalized ?? r.text}>
                        <Tag tone={r.importance === "required" ? "neutral" : "low"} title={r.importance === "required" ? "Key requirement" : "Nice to have"}>
                          {skillDisplayName(r.normalized ?? r.text)}
                          {r.importance === "preferred" ? <span className="text-ink-3">(nice to have)</span> : null}
                        </Tag>
                      </li>
                    ))}
                </ul>
              </div>
            ) : null}
            {otherReqs.length ? (
              <ul className="space-y-2 text-[14px] text-ink-2">
                {otherReqs.map((r, i) => (
                  <li key={i}>
                    <span className="font-medium text-ink">{r.importance === "required" ? "Required" : "Preferred"}: </span>
                    {r.text}
                  </li>
                ))}
              </ul>
            ) : null}
            {!skillReqs.length && !otherReqs.length ? <p className="text-ink-2">No specific requirements found. Read the full description.</p> : null}
            <p className="mt-4 text-[12.5px] text-ink-3">Extracted automatically from the listing and may miss details.</p>
          </Panel>
          {application ? (
            <Panel className="p-5">
              <SectionTitle>Your application</SectionTitle>
              <form action={setApplicationStatus} className="flex gap-2">
                <input type="hidden" name="jobId" value={id} />
                <select name="status" defaultValue={application.status} className="h-10 flex-1 rounded-md border border-line-strong bg-surface px-2" aria-label="Application status">
                  {Object.entries(STATUS_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
                <SubmitButton variant="secondary" pending="…">Update</SubmitButton>
              </form>
            </Panel>
          ) : null}
        </aside>
      </div>
    </>
  );
}
