import Link from "next/link";
import { hideJob, saveJob } from "@/app/actions/jobs";
import { describeFlag } from "@/lib/jobs/verify";
import { formatSalary, relativeDate, remoteLabel } from "@/lib/format";
import { FitTape, bandTone } from "./fit-tape";
import { cx, Tag } from "./ui";

export interface JobRowData {
  id: string;
  title: string;
  employer_name: string;
  location_raw: string | null;
  remote_type: string;
  remote_regions: string[];
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: string | null;
  posted_at: string | null;
  deadline_at: string | null;
  verification_status: "official" | "third_party" | "flagged";
  verification_flags: string[];
  apply_url: string | null;
  job_sources: { name: string; kind: string; is_official: boolean } | null;
}

export interface MatchRowData {
  score: number;
  band: string;
  reasons: string[];
  gaps: string[];
  disqualifiers: string[];
  breakdown: { label?: string };
}

export const JOB_ROW_SELECT =
  "id, title, employer_name, location_raw, remote_type, remote_regions, salary_min, salary_max, salary_currency, salary_period, posted_at, deadline_at, verification_status, verification_flags, apply_url, job_sources(name, kind, is_official)";

export function SourceLabel({ job }: { job: Pick<JobRowData, "verification_status" | "job_sources" | "verification_flags"> }) {
  const src = job.job_sources;
  if (job.verification_status === "flagged") {
    const reason = job.verification_flags.find((f) => f.startsWith("suspicious:"));
    return <Tag tone="block" title={reason ? describeFlag(reason) : undefined}>Check carefully: unusual listing</Tag>;
  }
  if (job.verification_status === "official") return <Tag tone="strong" title="Links straight to the employer's own application page">Employer's own listing</Tag>;
  return <Tag tone="neutral" title="Listed on a job board. You'll apply through it.">Via {src?.name ?? "job board"}</Tag>;
}

export function JobRow({ job, match, saved, compact = false }: { job: JobRowData; match: MatchRowData | null; saved?: boolean; compact?: boolean }) {
  const blocked = !!match?.disqualifiers?.length;
  const salary = formatSalary(job.salary_min, job.salary_max, job.salary_currency, job.salary_period);
  const posted = relativeDate(job.posted_at);
  const stale = job.verification_flags.includes("stale");
  const tone = match ? bandTone(match.band, blocked) : null;
  const toneText = tone ? { strong: "text-strong", possible: "text-possible", low: "text-low", block: "text-block" }[tone] : "";

  return (
    <article className="grid gap-4 px-4 py-5 sm:grid-cols-[1fr_200px] sm:gap-6 sm:px-5">
      <div className="min-w-0">
        <h3 className="text-[17px] leading-snug font-semibold">
          <Link href={`/jobs/${job.id}`} className="hover:underline underline-offset-2">{job.title}</Link>
        </h3>
        <p className="mt-0.5 text-ink-2">{job.employer_name}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13.5px] text-ink-2">
          <span>{remoteLabel(job.remote_type, job.remote_regions)}</span>
          {job.remote_type !== "remote" && job.location_raw ? <span className="text-ink-3">{job.location_raw}</span> : null}
          {salary ? <span className="font-medium text-ink num">{salary}</span> : null}
          {posted ? <span className={cx(stale && "text-possible")} title={stale ? "Older listing: it may already be filled" : undefined}>Posted {posted}</span> : null}
          {job.deadline_at ? <span className="font-medium text-ink">Closes {relativeDate(job.deadline_at)}</span> : null}
          <SourceLabel job={job} />
        </div>
        {match && !compact ? (
          <ul className="mt-3 space-y-1 text-[14px]">
            {match.disqualifiers.slice(0, 1).map((d) => (
              <li key={d} className="flex gap-2 text-block"><span aria-hidden>✕</span><span>{d}</span></li>
            ))}
            {match.reasons.slice(0, 2).map((r) => (
              <li key={r} className="flex gap-2"><span aria-hidden className="text-strong">✓</span><span>{r}</span></li>
            ))}
            {match.gaps.slice(0, 1).map((g) => (
              <li key={g} className="flex gap-2 text-ink-2"><span aria-hidden className="text-possible">–</span><span>{g}</span></li>
            ))}
          </ul>
        ) : null}
        {!compact ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Link href={`/jobs/${job.id}/apply`} className="inline-flex h-9 items-center rounded-md bg-ink px-3 text-[13.5px] font-semibold text-paper hover:bg-ink-2">
              Prepare application
            </Link>
            <form action={saveJob}>
              <input type="hidden" name="jobId" value={job.id} />
              <input type="hidden" name="value" value={saved ? "false" : "true"} />
              <button className="inline-flex h-9 items-center rounded-md border border-line-strong bg-surface px-3 text-[13.5px] font-semibold hover:border-ink">
                {saved ? "Saved" : "Save"}
              </button>
            </form>
            <form action={hideJob}>
              <input type="hidden" name="jobId" value={job.id} />
              <button className="inline-flex h-9 items-center rounded-md px-3 text-[13.5px] text-ink-3 hover:bg-sunken hover:text-ink">Hide</button>
            </form>
          </div>
        ) : null}
      </div>
      <div className="flex flex-col justify-start gap-2 sm:items-stretch">
        {match ? (
          <>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[26px] leading-none font-bold num">{match.score}</span>
              <span className={cx("text-[13.5px] font-semibold", toneText)}>{match.breakdown?.label ?? ""}</span>
            </div>
            <FitTape score={match.score} blocked={blocked} />
          </>
        ) : (
          <p className="text-[13.5px] text-ink-3">Open to see how you fit</p>
        )}
      </div>
    </article>
  );
}

export function JobList({ children }: { children: React.ReactNode }) {
  return <div className="divide-y divide-line rounded-[10px] border border-line bg-surface">{children}</div>;
}
