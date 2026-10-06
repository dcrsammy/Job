import type { Metadata } from "next";
import Link from "next/link";
import { adminSetJob, toggleSource } from "@/app/actions/admin";
import { AddSourceForm, AdminAction, RunSourceButton } from "@/components/admin-forms";
import { Empty, Stats, Table, Td } from "@/components/admin-ui";
import { cx, Input, Panel, SectionTitle, Select, Tag } from "@/components/ui";
import { relativeDate } from "@/lib/format";
import { since } from "@/lib/services/admin-data";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Admin · Jobs & sources" };
export const dynamic = "force-dynamic";

export default async function AdminJobs({ searchParams }: { searchParams: Promise<{ q?: string; show?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 100).replace(/[%,()]/g, "");
  const db = createAdminClient();

  let jobsQuery = db
    .from("jobs")
    .select("id, title, employer_name, is_active, verification_status, verification_flags, posted_at, last_seen_at, apply_url, job_sources(name)")
    .is("duplicate_of", null)
    .order("last_seen_at", { ascending: false })
    .limit(40);
  if (q) jobsQuery = jobsQuery.or(`title.ilike.%${q}%,employer_name.ilike.%${q}%`);
  if (sp.show === "flagged") jobsQuery = jobsQuery.eq("verification_status", "flagged");
  else if (sp.show === "closed") jobsQuery = jobsQuery.eq("is_active", false);
  else if (sp.show !== "all") jobsQuery = jobsQuery.eq("is_active", true);

  const [{ data: sources }, { data: stats }, { data: runs }, { data: jobs }, { count: live }, { count: newToday }, { count: flagged }, { count: closed7 }] = await Promise.all([
    db.from("job_sources").select("*").order("name"),
    db.rpc("source_stats"),
    db.from("ingestion_runs").select("id, source_id, status, started_at, fetched, inserted, updated, deactivated, flagged, duplicates, errors").order("started_at", { ascending: false }).limit(20),
    jobsQuery,
    db.from("jobs").select("id", { count: "exact", head: true }).eq("is_active", true).is("duplicate_of", null),
    db.from("jobs").select("id", { count: "exact", head: true }).gte("first_seen_at", since(1)),
    db.from("jobs").select("id", { count: "exact", head: true }).eq("verification_status", "flagged").eq("is_active", true),
    db.from("jobs").select("id", { count: "exact", head: true }).eq("is_active", false).gte("updated_at", since(7)),
  ]);
  type SourceStat = { source_id: string; active_jobs: number; flagged_jobs: number };
  const statBy = new Map<string, SourceStat>(((stats ?? []) as SourceStat[]).map((s) => [s.source_id, s]));
  const nameBy = new Map((sources ?? []).map((s) => [s.id, s.name]));
  const failing = (sources ?? []).filter((s) => s.enabled && s.consecutive_failures > 0).length;
  const sel = "h-8 rounded border border-line-strong bg-surface px-1.5 text-[12.5px]";

  return (
    <>
      <Stats
        items={[
          { n: live ?? 0, l: "Live jobs" },
          { n: newToday ?? 0, l: "New in the last 24 hours" },
          { n: flagged ?? 0, l: "Flagged as suspicious", href: "/admin/jobs?show=flagged", tone: flagged ? "warn" : undefined },
          { n: `${failing} / ${(sources ?? []).filter((s) => s.enabled).length}`, l: "Sources failing / enabled", tone: failing ? "bad" : undefined },
        ]}
      />

      <section className="mb-10">
        <SectionTitle aside={<span className="text-[13px] text-ink-3 num">{closed7 ?? 0} listings closed this week</span>}>Find a job</SectionTitle>
        <form className="mb-3 flex flex-wrap gap-2" action="/admin/jobs">
          <Input name="q" defaultValue={sp.q} placeholder="Title or employer" className="h-10 w-[280px]" aria-label="Search jobs" />
          <Select name="show" defaultValue={sp.show ?? "live"} className="h-10 w-[160px]" aria-label="Show">
            <option value="live">Live</option>
            <option value="flagged">Flagged</option>
            <option value="closed">Closed</option>
            <option value="all">All</option>
          </Select>
          <button className="h-10 rounded-md bg-ink px-4 text-[14px] font-semibold text-paper">Search</button>
        </form>
        {jobs?.length ? (
          <Table head={["Job", "Source", "Seen", "Trust", "Visible", "Mark as"]} min={980}>
            {jobs.map((j) => (
              <tr key={j.id} className={cx(!j.is_active && "text-ink-3")}>
                <Td>
                  <Link href={`/jobs/${j.id}`} className="font-medium hover:underline">{j.title}</Link>
                  <p className="text-[12.5px] text-ink-3">{j.employer_name}</p>
                </Td>
                <Td>{(j.job_sources as unknown as { name: string } | null)?.name}</Td>
                <Td className="whitespace-nowrap">{relativeDate(j.last_seen_at)}</Td>
                <Td>
                  <Tag tone={j.verification_status === "official" ? "strong" : j.verification_status === "flagged" ? "block" : "neutral"}>{j.verification_status.replace("_", " ")}</Tag>
                  {j.verification_flags?.length ? <p className="mt-1 max-w-[220px] text-[12px] text-ink-3">{j.verification_flags.join(", ")}</p> : null}
                </Td>
                <Td>
                  <AdminAction action={adminSetJob} fields={{ id: j.id, active: j.is_active ? "false" : "true" }} label={j.is_active ? "Hide" : "Show again"} confirm={j.is_active ? "Hide this job from everyone?" : undefined} />
                </Td>
                <Td>
                  <AdminAction action={adminSetJob} fields={{ id: j.id }} label="Save" inline>
                    <select name="verification" defaultValue={j.verification_status} className={sel} aria-label="Trust">
                      <option value="official">Official</option>
                      <option value="third_party">Job board</option>
                      <option value="flagged">Flagged</option>
                    </select>
                  </AdminAction>
                </Td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>No jobs match.</Empty>
        )}
      </section>

      <section className="mb-10">
        <SectionTitle>Job sources</SectionTitle>
        <Table head={["Source", "Type", "Live jobs", "Last run", "Health", "Actions"]} min={900}>
          {(sources ?? []).map((s) => {
            const st = statBy.get(s.id);
            const healthy = s.consecutive_failures === 0;
            return (
              <tr key={s.id} className={cx(!s.enabled && "text-ink-3")}>
                <Td>
                  <p className="font-semibold">{s.name}</p>
                  <p className="text-[12.5px] text-ink-3">{s.slug}</p>
                </Td>
                <Td>
                  {s.kind}
                  <br />
                  {s.is_official ? <Tag tone="strong">Employer</Tag> : <Tag>Job board</Tag>}
                </Td>
                <Td className="num">
                  {st?.active_jobs ?? 0}
                  {st?.flagged_jobs ? <span className="block text-block">{st.flagged_jobs} flagged</span> : null}
                </Td>
                <Td>{s.last_run_at ? relativeDate(s.last_run_at) : "Never"}</Td>
                <Td className="max-w-[260px]">
                  {!s.enabled ? <Tag>Disabled</Tag> : healthy ? <Tag tone="strong">OK</Tag> : <Tag tone="block">{s.consecutive_failures} failures</Tag>}
                  {s.last_error ? <p className="mt-1 line-clamp-2 text-[12.5px] text-block" title={s.last_error}>{s.last_error}</p> : null}
                </Td>
                <Td>
                  <div className="flex flex-col items-start gap-2">
                    {s.enabled ? <RunSourceButton id={s.id} /> : null}
                    <form action={toggleSource}>
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="enabled" value={s.enabled ? "false" : "true"} />
                      <button className="text-[12.5px] underline underline-offset-2">{s.enabled ? "Disable" : "Enable"}</button>
                    </form>
                  </div>
                </Td>
              </tr>
            );
          })}
        </Table>
      </section>

      <div className="grid gap-10 lg:grid-cols-2">
        <section>
          <SectionTitle>Recent ingestion runs</SectionTitle>
          <Panel as="div" className="divide-y divide-line text-[13.5px]">
            {(runs ?? []).map((r) => (
              <div key={r.id} className="px-4 py-2.5">
                <div className="flex justify-between gap-2">
                  <span className="font-semibold">{nameBy.get(r.source_id)}</span>
                  <span className={cx(r.status === "failed" ? "text-block" : r.status === "partial" ? "text-possible" : "text-strong")}>{r.status}</span>
                </div>
                <p className="text-ink-2 num">
                  {relativeDate(r.started_at)}: {r.fetched} fetched, {r.inserted} new, {r.updated} updated, {r.deactivated} closed, {r.duplicates} duplicates, {r.flagged} flagged
                </p>
                {(r.errors as string[])?.length ? <p className="line-clamp-2 text-block">{(r.errors as string[])[0]}</p> : null}
              </div>
            ))}
            {!runs?.length ? <p className="px-4 py-3 text-ink-2">No runs yet.</p> : null}
          </Panel>
        </section>
        <section>
          <SectionTitle>Add a source</SectionTitle>
          <Panel className="p-5">
            <AddSourceForm />
            <p className="mt-4 text-[13px] text-ink-3">
              Only add sources whose terms allow this use. Employer job boards on Greenhouse, Lever and Ashby publish public APIs for exactly this. Careers pages are fetched only where robots.txt allows.
            </p>
          </Panel>
        </section>
      </div>
    </>
  );
}
