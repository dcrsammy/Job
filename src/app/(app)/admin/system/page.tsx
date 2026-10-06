import type { Metadata } from "next";
import { adminRunQueue, adminTask } from "@/app/actions/admin";
import { AdminAction } from "@/components/admin-forms";
import { Empty, Table, Td } from "@/components/admin-ui";
import { cx, Panel, SectionTitle, Tag } from "@/components/ui";
import { relativeDate } from "@/lib/format";
import { emailsFor, since } from "@/lib/services/admin-data";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Admin · System" };
export const dynamic = "force-dynamic";

function describeTask(kind: string, payload: Record<string, string>, names: Map<string, string>, emails: Map<string, string>) {
  if (kind === "ingest_source") return `Fetch jobs from ${names.get(payload.source_id) ?? "a source"}`;
  if (kind === "match_user") return `Match jobs for ${emails.get(payload.user_id) ?? "a user"}`;
  if (kind === "purge_expired") return "Daily housekeeping (tracker follow-ups, resume retention)";
  return kind;
}

export default async function AdminSystem({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams;
  const db = createAdminClient();
  let tq = db.from("task_queue").select("id, kind, payload, status, attempts, max_attempts, run_after, last_error, created_at").order("created_at", { ascending: false }).limit(60);
  if (sp.status) tq = tq.eq("status", sp.status);
  const [{ data: all }, { data: tasks }, { data: sources }, { data: usage }] = await Promise.all([
    db.from("task_queue").select("kind, status").limit(50000),
    tq,
    db.from("job_sources").select("id, name"),
    db.from("ai_usage").select("feature, provider, model, cost_usd, input_tokens, output_tokens, ok").gte("created_at", since(30)).limit(50000),
  ]);
  const names = new Map((sources ?? []).map((s) => [s.id, s.name]));
  const emails = await emailsFor(db, (tasks ?? []).map((t) => (t.payload as Record<string, string>)?.user_id));
  const counts = (all ?? []).reduce<Record<string, Record<string, number>>>((a, t) => {
    a[t.kind] ??= {};
    a[t.kind][t.status] = (a[t.kind][t.status] ?? 0) + 1;
    return a;
  }, {});
  const usageBy = (usage ?? []).reduce<Record<string, { calls: number; cost: number; failed: number; tokens: number }>>((a, u) => {
    const k = `${u.feature} · ${u.provider === "template" ? "template" : u.model}`;
    a[k] ??= { calls: 0, cost: 0, failed: 0, tokens: 0 };
    a[k].calls++;
    a[k].cost += Number(u.cost_usd);
    a[k].tokens += u.input_tokens + u.output_tokens;
    if (!u.ok) a[k].failed++;
    return a;
  }, {});
  const total = Object.values(usageBy).reduce((s, x) => s + x.cost, 0);

  const env = [
    { k: "Supabase service key", ok: !!process.env.SUPABASE_SERVICE_ROLE_KEY },
    { k: "Claude API key", ok: !!process.env.ANTHROPIC_API_KEY },
    { k: "AI model", ok: true, v: `${process.env.AI_MODEL ?? "claude-sonnet-5-5"} / ${process.env.AI_MODEL_FAST ?? "claude-haiku-4-5-20251001"}` },
    { k: "Cron secret (for /api/cron/tick)", ok: !!process.env.CRON_SECRET },
    { k: "Adzuna keys", ok: !!(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY), optional: true },
    { k: "Google sign-in", ok: process.env.NEXT_PUBLIC_GOOGLE_AUTH === "true", optional: true },
    { k: "Site URL", ok: !!process.env.NEXT_PUBLIC_SITE_URL, v: process.env.NEXT_PUBLIC_SITE_URL, optional: true },
  ];

  return (
    <>
      <section className="mb-10">
        <SectionTitle>Background work</SectionTitle>
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          {Object.entries(counts).map(([kind, c]) => (
            <Panel key={kind} className="p-4 text-[13.5px]">
              <p className="font-semibold">{kind.replace("_", " ")}</p>
              <p className="mt-1 text-ink-2 num">
                {c.queued ?? 0} waiting · {c.running ?? 0} running · {c.done ?? 0} done · <span className={cx(!!c.failed && "text-block")}>{c.failed ?? 0} failed</span>
              </p>
            </Panel>
          ))}
        </div>
        <Panel className="flex flex-wrap items-start gap-x-6 gap-y-4 p-4">
          <AdminAction action={adminRunQueue} label="Process queue now" variant="primary" />
          <AdminAction action={adminTask} fields={{ op: "retry_failed" }} label="Retry all failed" />
          <AdminAction action={adminTask} fields={{ op: "rematch_all" }} label="Re-match every user" confirm="Queue matching for every user with a confirmed profile?" />
          <AdminAction action={adminTask} fields={{ op: "housekeeping" }} label="Run daily housekeeping" />
          <AdminAction action={adminTask} fields={{ op: "clear_finished" }} label="Clear finished tasks" variant="ghost" />
        </Panel>
        <p className="mt-2 text-[13px] text-ink-3">The GitHub Actions worker processes the queue every 30 minutes. Housekeeping moves 30-day-old applications to No response, marks closed listings and deletes expired resumes.</p>
      </section>

      <section className="mb-10">
        <SectionTitle
          aside={
            <span className="flex gap-2 text-[13px]">
              {["", "queued", "running", "failed", "done"].map((s) => (
                <a key={s} href={`/admin/system${s ? `?status=${s}` : ""}`} className={cx("underline-offset-2 hover:underline", (sp.status ?? "") === s ? "font-semibold text-ink" : "text-ink-2")}>
                  {s || "all"}
                </a>
              ))}
            </span>
          }
        >
          Task queue
        </SectionTitle>
        {tasks?.length ? (
          <Table head={["Task", "Status", "Tries", "Created", "Error", ""]} min={900}>
            {tasks.map((t) => (
              <tr key={t.id}>
                <Td>{describeTask(t.kind, (t.payload ?? {}) as Record<string, string>, names, emails)}</Td>
                <Td>
                  <Tag tone={t.status === "failed" ? "block" : t.status === "done" ? "strong" : t.status === "running" ? "possible" : "neutral"}>{t.status}</Tag>
                </Td>
                <Td className="num">
                  {t.attempts}/{t.max_attempts}
                </Td>
                <Td className="whitespace-nowrap">{relativeDate(t.created_at)}</Td>
                <Td className="max-w-[340px]">{t.last_error ? <p className="line-clamp-3 text-[12.5px] text-block" title={t.last_error}>{t.last_error}</p> : null}</Td>
                <Td>
                  <div className="flex gap-2">
                    {t.status === "failed" || t.status === "running" ? <AdminAction action={adminTask} fields={{ op: "retry", id: t.id }} label="Retry" /> : null}
                    <AdminAction action={adminTask} fields={{ op: "delete", id: t.id }} label="Delete" variant="ghost" />
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>No tasks.</Empty>
        )}
      </section>

      <div className="grid gap-10 lg:grid-cols-2">
        <section>
          <SectionTitle aside={<span className="text-[13.5px] font-semibold num">${total.toFixed(2)}</span>}>AI usage, last 30 days</SectionTitle>
          <Panel as="div" className="divide-y divide-line text-[13.5px]">
            {Object.entries(usageBy)
              .sort((a, b) => b[1].cost - a[1].cost)
              .map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2 px-4 py-2.5 num">
                  <span>{k}</span>
                  <span className="text-ink-2">
                    {v.calls} calls{v.failed ? <span className="text-block">, {v.failed} failed</span> : null}, {(v.tokens / 1000).toFixed(0)}k tokens, ${v.cost.toFixed(2)}
                  </span>
                </div>
              ))}
            {!Object.keys(usageBy).length ? <p className="px-4 py-3 text-ink-2">No AI usage yet.</p> : null}
          </Panel>
          <a href="/api/admin/ai-check" target="_blank" rel="noopener" className="mt-3 inline-flex h-9 items-center rounded-md border border-line-strong bg-surface px-3 text-[13.5px] font-semibold hover:border-ink">
            Test both AI models now
          </a>
        </section>
        <section>
          <SectionTitle>Configuration</SectionTitle>
          <Panel as="div" className="divide-y divide-line text-[13.5px]">
            {env.map((e) => (
              <div key={e.k} className="flex justify-between gap-3 px-4 py-2.5">
                <span>{e.k}</span>
                <span className={cx(e.ok ? "text-strong" : e.optional ? "text-ink-3" : "text-block")}>{e.v ?? (e.ok ? "Set" : e.optional ? "Not set (optional)" : "Missing")}</span>
              </div>
            ))}
          </Panel>
          <p className="mt-2 text-[13px] text-ink-3">Secrets are never shown here, only whether they're set. Change them in Cloudflare → Workers → job → Settings → Variables.</p>
        </section>
      </div>
    </>
  );
}
