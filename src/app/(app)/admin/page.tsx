import type { Metadata } from "next";
import Link from "next/link";
import { adminDeclineRequest, adminRunQueue, adminSetPlan } from "@/app/actions/admin";
import { AdminAction } from "@/components/admin-forms";
import { ACTION_LABEL, Empty, PlanTag, Stats, Table, Td, UserLink } from "@/components/admin-ui";
import { SectionTitle, Tag } from "@/components/ui";
import { effectivePlan, planInfo, type PlanTier } from "@/lib/config";
import { relativeDate } from "@/lib/format";
import { emailsFor, since } from "@/lib/services/admin-data";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

const DURATIONS = [
  { v: "30", l: "30 days" },
  { v: "90", l: "90 days" },
  { v: "365", l: "1 year" },
  { v: "0", l: "No end date" },
];

export default async function AdminOverview() {
  const db = createAdminClient();
  const [
    { count: users },
    { count: newUsers },
    { data: subs },
    { count: activeJobs },
    { count: apps },
    { count: applied30 },
    { data: usage },
    { count: aiErrors },
    { data: queue },
    { data: activity },
    { data: signups },
    { data: errors },
  ] = await Promise.all([
    db.from("profiles").select("id", { count: "exact", head: true }),
    db.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", since(7)),
    db.from("subscriptions").select("user_id, plan, status, current_period_end, requested_plan, requested_at, credits").limit(20000),
    db.from("jobs").select("id", { count: "exact", head: true }).eq("is_active", true).is("duplicate_of", null),
    db.from("applications").select("id", { count: "exact", head: true }),
    db.from("applications").select("id", { count: "exact", head: true }).gte("applied_at", since(30)),
    db.from("ai_usage").select("cost_usd, ok, provider").gte("created_at", since(30)).limit(20000),
    db.from("ai_usage").select("id", { count: "exact", head: true }).eq("ok", false).gte("created_at", since(7)),
    db.from("task_queue").select("status"),
    db.from("audit_logs").select("id, user_id, actor, action, metadata, created_at").order("created_at", { ascending: false }).limit(25),
    db.from("profiles").select("created_at").gte("created_at", since(14)),
    db.from("audit_logs").select("id, user_id, metadata, created_at").eq("action", "ai.error").order("created_at", { ascending: false }).limit(6),
  ]);

  const byPlan: Record<PlanTier, number> = { free: 0, pro: 0, premium: 0 };
  for (const s of subs ?? []) byPlan[effectivePlan(s)]++;
  const requests = (subs ?? []).filter((s) => s.requested_plan).sort((a, b) => String(a.requested_at).localeCompare(String(b.requested_at)));
  const aiCost = (usage ?? []).reduce((s, u) => s + Number(u.cost_usd), 0);
  const aiCalls = (usage ?? []).filter((u) => u.provider !== "template").length;
  const q = (queue ?? []).reduce<Record<string, number>>((a, t) => ((a[t.status] = (a[t.status] ?? 0) + 1), a), {});
  const emails = await emailsFor(db, [...requests.map((r) => r.user_id), ...(activity ?? []).map((a) => a.user_id), ...(errors ?? []).map((e) => e.user_id)]);

  // Sign-ups per day, last 14 days.
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.now() - (13 - i) * 86_400_000).toISOString().slice(0, 10);
    return { d, n: (signups ?? []).filter((s) => s.created_at.slice(0, 10) === d).length };
  });
  const maxDay = Math.max(1, ...days.map((d) => d.n));

  return (
    <>
      <Stats
        items={[
          { n: users ?? 0, l: `Users (${newUsers ?? 0} new this week)`, href: "/admin/users" },
          { n: byPlan.pro + byPlan.premium, l: `Paid: ${byPlan.pro} Pro, ${byPlan.premium} Premium`, href: "/admin/users?plan=paid" },
          { n: requests.length, l: "Plan requests waiting", tone: requests.length ? "warn" : undefined },
          { n: activeJobs ?? 0, l: "Live jobs", href: "/admin/jobs" },
          { n: apps ?? 0, l: `Applications (${applied30 ?? 0} applied in 30 days)`, href: "/admin/applications" },
          { n: `$${aiCost.toFixed(2)}`, l: `AI cost, 30 days (${aiCalls} calls)`, href: "/admin/system" },
          { n: aiErrors ?? 0, l: "AI failures, 7 days", tone: aiErrors ? "bad" : undefined, href: "/admin/activity?type=ai&ok=false" },
          { n: `${(q.queued ?? 0) + (q.running ?? 0)} / ${q.failed ?? 0}`, l: "Tasks waiting / failed", tone: q.failed ? "bad" : undefined, href: "/admin/system" },
        ]}
      />

      <section className="mb-10">
        <SectionTitle aside={<span className="text-[13px] text-ink-3">Paid plans aren't charged yet: approving gives access for free.</span>}>Plan requests</SectionTitle>
        {requests.length ? (
          <Table head={["User", "Wants", "Currently", "Asked", "Approve", ""]} min={820}>
            {requests.map((r) => (
              <tr key={r.user_id}>
                <Td>
                  <UserLink id={r.user_id} email={emails.get(r.user_id)} />
                </Td>
                <Td>
                  <PlanTag plan={r.requested_plan} />
                </Td>
                <Td>
                  <PlanTag plan={effectivePlan(r)} />
                </Td>
                <Td className="whitespace-nowrap">{relativeDate(r.requested_at)}</Td>
                <Td>
                  <AdminAction action={adminSetPlan} fields={{ userId: r.user_id, plan: r.requested_plan! }} label={`Give ${planInfo[r.requested_plan as PlanTier].name}`} variant="primary" inline>
                    <select name="days" defaultValue="30" aria-label="For how long" className="h-8 rounded border border-line-strong bg-surface px-1.5 text-[12.5px]">
                      {DURATIONS.map((d) => (
                        <option key={d.v} value={d.v}>{d.l}</option>
                      ))}
                    </select>
                  </AdminAction>
                </Td>
                <Td>
                  <AdminAction action={adminDeclineRequest} fields={{ userId: r.user_id }} label="Decline" variant="ghost" confirm="Decline this request?" />
                </Td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>No one is waiting for a plan.</Empty>
        )}
      </section>

      <div className="grid gap-10 lg:grid-cols-[1fr_340px]">
        <section>
          <SectionTitle aside={<Link href="/admin/activity" className="text-[13.5px] underline underline-offset-2">All activity</Link>}>Live activity</SectionTitle>
          <div className="divide-y divide-line rounded-[10px] border border-line bg-surface text-[13.5px]">
            {(activity ?? []).map((a) => (
              <div key={a.id} className="flex items-baseline justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <span className="font-semibold">{ACTION_LABEL[a.action] ?? a.action}</span>{" "}
                  <span className="text-ink-2">
                    · <UserLink id={a.user_id} email={emails.get(a.user_id ?? "")} />
                  </span>
                  {a.actor !== "user" ? <span className="ml-1.5"><Tag>{a.actor}</Tag></span> : null}
                  {a.action === "ai.error" ? <p className="truncate text-block">{String((a.metadata as { message?: string })?.message ?? "")}</p> : null}
                </div>
                <span className="shrink-0 text-ink-3">{relativeDate(a.created_at)}</span>
              </div>
            ))}
            {!activity?.length ? <p className="px-4 py-3 text-ink-2">Nothing yet.</p> : null}
          </div>
        </section>

        <aside className="flex flex-col gap-10">
          <section>
            <SectionTitle>Sign-ups, last 14 days</SectionTitle>
            <div className="flex h-28 items-end gap-1 rounded-[10px] border border-line bg-surface p-3" role="img" aria-label={`Sign-ups per day: ${days.map((d) => d.n).join(", ")}`}>
              {days.map((d) => (
                <div key={d.d} className="flex flex-1 flex-col items-center justify-end" title={`${d.d}: ${d.n}`}>
                  <div className="w-full rounded-sm bg-ink" style={{ height: `${Math.max(2, (d.n / maxDay) * 80)}px`, opacity: d.n ? 1 : 0.15 }} />
                </div>
              ))}
            </div>
          </section>
          <section>
            <SectionTitle>Users by plan</SectionTitle>
            <ul className="divide-y divide-line rounded-[10px] border border-line bg-surface text-[14px]">
              {(Object.keys(byPlan) as PlanTier[]).map((p) => (
                <li key={p} className="flex justify-between px-4 py-2.5">
                  <Link href={`/admin/users?plan=${p}`} className="hover:underline">{planInfo[p].name}</Link>
                  <span className="num">{byPlan[p]}</span>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <SectionTitle>Latest AI errors</SectionTitle>
            <div className="divide-y divide-line rounded-[10px] border border-line bg-surface text-[13px]">
              {(errors ?? []).map((e) => (
                <div key={e.id} className="px-4 py-2.5">
                  <p className="text-ink-3">
                    {String((e.metadata as { feature?: string })?.feature ?? "")} · {relativeDate(e.created_at)} · <UserLink id={e.user_id} email={emails.get(e.user_id ?? "")} />
                  </p>
                  <p className="line-clamp-3 text-block">{String((e.metadata as { message?: string })?.message ?? "")}</p>
                </div>
              ))}
              {!errors?.length ? <p className="px-4 py-3 text-ink-2">None. </p> : null}
            </div>
          </section>
          <section>
            <SectionTitle>Background work</SectionTitle>
            <AdminAction action={adminRunQueue} label="Process queue now" pending="Working…" />
          </section>
        </aside>
      </div>
    </>
  );
}
