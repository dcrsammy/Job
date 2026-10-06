import type { Metadata } from "next";
import { runQueueNow, toggleSource } from "@/app/actions/admin";
import { AddSourceForm, RunSourceButton } from "@/components/admin-forms";
import { SubmitButton } from "@/components/submit-button";
import { cx, PageHeader, Panel, SectionTitle, Tag } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { relativeDate } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage() {
  await requireAdmin();
  const db = createAdminClient();
  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [{ data: sources }, { data: stats }, { data: runs }, { data: queue }, { data: failed }, { data: usage }, { count: users }, { count: activeJobs }] = await Promise.all([
    db.from("job_sources").select("*").order("name"),
    db.rpc("source_stats"),
    db.from("ingestion_runs").select("id, source_id, status, started_at, finished_at, fetched, inserted, updated, deactivated, flagged, duplicates, errors").order("started_at", { ascending: false }).limit(25),
    db.from("task_queue").select("status"),
    db.from("task_queue").select("id, kind, last_error, attempts, created_at").eq("status", "failed").order("created_at", { ascending: false }).limit(10),
    db.from("ai_usage").select("feature, provider, cost_usd, input_tokens, output_tokens, ok").gte("created_at", since30),
    db.from("profiles").select("id", { count: "exact", head: true }),
    db.from("jobs").select("id", { count: "exact", head: true }).eq("is_active", true).is("duplicate_of", null),
  ]);
  type SourceStat = { source_id: string; active_jobs: number; flagged_jobs: number };
  const statBy = new Map<string, SourceStat>(((stats ?? []) as SourceStat[]).map((s) => [s.source_id, s]));
  const nameBy = new Map((sources ?? []).map((s) => [s.id, s.name]));
  const queueCounts = (queue ?? []).reduce<Record<string, number>>((a, t) => ((a[t.status] = (a[t.status] ?? 0) + 1), a), {});
  const usageBy = (usage ?? []).reduce<Record<string, { calls: number; cost: number; failed: number; tokens: number }>>((a, u) => {
    const k = `${u.feature} (${u.provider})`;
    a[k] ??= { calls: 0, cost: 0, failed: 0, tokens: 0 };
    a[k].calls++;
    a[k].cost += Number(u.cost_usd);
    a[k].tokens += u.input_tokens + u.output_tokens;
    if (!u.ok) a[k].failed++;
    return a;
  }, {});
  const totalCost = Object.values(usageBy).reduce((s, x) => s + x.cost, 0);

  return (
    <>
      <PageHeader title="Admin" description="Job sources, ingestion health, background work and AI costs." />
      <section className="mb-10 grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-line bg-line sm:grid-cols-4">
        {[
          { n: activeJobs ?? 0, l: "Live jobs" },
          { n: users ?? 0, l: "Users" },
          { n: (queueCounts.queued ?? 0) + (queueCounts.running ?? 0), l: "Tasks waiting" },
          { n: `$${totalCost.toFixed(2)}`, l: "AI cost, last 30 days" },
        ].map((s) => (
          <div key={s.l} className="bg-surface px-5 py-4">
            <span className="block text-[26px] leading-none font-bold num">{s.n}</span>
            <span className="mt-1.5 block text-[14px] text-ink-2">{s.l}</span>
          </div>
        ))}
      </section>

      <section className="mb-10">
        <SectionTitle
          aside={
            <form action={runQueueNow}>
              <SubmitButton variant="secondary" className="h-9" pending="Working…">Process queue now</SubmitButton>
            </form>
          }
        >
          Job sources
        </SectionTitle>
        <Panel as="div" className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-[13.5px]">
            <thead className="border-b border-line text-left text-ink-2">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Source</th>
                <th className="px-4 py-2.5 font-semibold">Type</th>
                <th className="px-4 py-2.5 font-semibold">Live jobs</th>
                <th className="px-4 py-2.5 font-semibold">Last run</th>
                <th className="px-4 py-2.5 font-semibold">Health</th>
                <th className="px-4 py-2.5 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(sources ?? []).map((s) => {
                const st = statBy.get(s.id);
                const healthy = s.consecutive_failures === 0;
                return (
                  <tr key={s.id} className={cx("align-top", !s.enabled && "text-ink-3")}>
                    <td className="px-4 py-3">
                      <p className="font-semibold">{s.name}</p>
                      <p className="text-[12.5px] text-ink-3">{s.slug}</p>
                    </td>
                    <td className="px-4 py-3">
                      {s.kind}
                      <br />
                      {s.is_official ? <Tag tone="strong">Employer</Tag> : <Tag>Job board</Tag>}
                    </td>
                    <td className="px-4 py-3 num">
                      {st?.active_jobs ?? 0}
                      {st?.flagged_jobs ? <span className="block text-block">{st.flagged_jobs} flagged</span> : null}
                    </td>
                    <td className="px-4 py-3">{s.last_run_at ? relativeDate(s.last_run_at) : "Never"}</td>
                    <td className="max-w-[260px] px-4 py-3">
                      {!s.enabled ? <Tag>Disabled</Tag> : healthy ? <Tag tone="strong">OK</Tag> : <Tag tone="block">{s.consecutive_failures} failures</Tag>}
                      {s.last_error ? <p className="mt-1 line-clamp-2 text-[12.5px] text-block" title={s.last_error}>{s.last_error}</p> : null}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-2">
                        {s.enabled ? <RunSourceButton id={s.id} /> : null}
                        <form action={toggleSource}>
                          <input type="hidden" name="id" value={s.id} />
                          <input type="hidden" name="enabled" value={s.enabled ? "false" : "true"} />
                          <button className="text-[12.5px] underline underline-offset-2">{s.enabled ? "Disable" : "Enable"}</button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      </section>

      <section className="mb-10">
        <SectionTitle>Add a source</SectionTitle>
        <Panel className="p-5">
          <AddSourceForm />
          <p className="mt-4 text-[13px] text-ink-3">
            Only add sources whose terms allow this use. Employer job boards on Greenhouse, Lever and Ashby publish public APIs for exactly this. Careers pages are fetched only where robots.txt allows.
          </p>
        </Panel>
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
        <section className="flex flex-col gap-10">
          <div>
            <SectionTitle>AI usage, last 30 days</SectionTitle>
            <Panel as="div" className="divide-y divide-line text-[13.5px]">
              {Object.entries(usageBy).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2 px-4 py-2.5 num">
                  <span>{k}</span>
                  <span className="text-ink-2">
                    {v.calls} calls{v.failed ? `, ${v.failed} failed` : ""}, {(v.tokens / 1000).toFixed(0)}k tokens, ${v.cost.toFixed(2)}
                  </span>
                </div>
              ))}
              {!Object.keys(usageBy).length ? <p className="px-4 py-3 text-ink-2">No AI usage yet.</p> : null}
            </Panel>
          </div>
          <div>
            <SectionTitle>Failed background tasks</SectionTitle>
            <Panel as="div" className="divide-y divide-line text-[13.5px]">
              {(failed ?? []).map((t) => (
                <div key={t.id} className="px-4 py-2.5">
                  <p className="font-semibold">{t.kind} <span className="font-normal text-ink-3">{relativeDate(t.created_at)}, {t.attempts} attempts</span></p>
                  <p className="line-clamp-2 text-block">{t.last_error}</p>
                </div>
              ))}
              {!failed?.length ? <p className="px-4 py-3 text-ink-2">None.</p> : null}
            </Panel>
          </div>
        </section>
      </div>
    </>
  );
}
