import type { Metadata } from "next";
import Link from "next/link";
import { Empty, Pager, PlanTag, Table, Td } from "@/components/admin-ui";
import { Input, Select, Tag } from "@/components/ui";
import { effectivePlan, planInfo, PLAN_TIERS } from "@/lib/config";
import { relativeDate, shortDate } from "@/lib/format";
import { authInfo, since } from "@/lib/services/admin-data";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Admin · Users" };
export const dynamic = "force-dynamic";

const PER_PAGE = 50;

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ q?: string; plan?: string; page?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const q = (sp.q ?? "").trim().slice(0, 100);
  const db = createAdminClient();

  // Filter by plan through the subscriptions table first.
  let planIds: string[] | null = null;
  if (sp.plan && sp.plan !== "all") {
    const { data: subs } = await db.from("subscriptions").select("user_id, plan, status, current_period_end, requested_plan").limit(20000);
    planIds = (subs ?? [])
      .filter((s) => (sp.plan === "requested" ? !!s.requested_plan : sp.plan === "paid" ? effectivePlan(s) !== "free" : effectivePlan(s) === sp.plan))
      .map((s) => s.user_id);
  }

  const term = q.replace(/[%,()]/g, "");
  let profiles: { id: string; email: string | null; full_name: string | null; role: string; created_at: string }[] = [];
  let count = 0;
  if (planIds) {
    // Filter in memory so we never send a huge id list in one request.
    const keep = new Set(planIds);
    let all = db.from("profiles").select("id, email, full_name, role, created_at").order("created_at", { ascending: false }).limit(20000);
    if (term) all = all.or(`email.ilike.%${term}%,full_name.ilike.%${term}%`);
    const { data } = await all;
    const filtered = (data ?? []).filter((p) => keep.has(p.id));
    count = filtered.length;
    profiles = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  } else {
    let query = db.from("profiles").select("id, email, full_name, role, created_at", { count: "exact" }).order("created_at", { ascending: false });
    if (term) query = query.or(`email.ilike.%${term}%,full_name.ilike.%${term}%`);
    const { data, count: c } = await query.range((page - 1) * PER_PAGE, page * PER_PAGE - 1);
    profiles = data ?? [];
    count = c ?? 0;
  }
  const ids = (profiles ?? []).map((p) => p.id);

  const [{ data: subs }, { data: cands }, { data: apps }, { data: usage }, auth] = await Promise.all([
    db.from("subscriptions").select("user_id, plan, status, current_period_end, requested_plan, credits").in("user_id", ids),
    db.from("candidate_profiles").select("user_id, headline, confirmed_at, source_resume_id").in("user_id", ids),
    db.from("applications").select("user_id, status").in("user_id", ids),
    db.from("ai_usage").select("user_id, cost_usd, ok").in("user_id", ids).gte("created_at", since(30)),
    authInfo(db, ids),
  ]);
  const subBy = new Map((subs ?? []).map((s) => [s.user_id, s]));
  const candBy = new Map((cands ?? []).map((c) => [c.user_id, c]));
  const appCount = (apps ?? []).reduce<Record<string, { all: number; applied: number }>>((a, r) => {
    a[r.user_id] ??= { all: 0, applied: 0 };
    a[r.user_id].all++;
    if (!["saved", "interested", "preparing"].includes(r.status)) a[r.user_id].applied++;
    return a;
  }, {});
  const costBy = (usage ?? []).reduce<Record<string, { cost: number; failed: number }>>((a, r) => {
    a[r.user_id] ??= { cost: 0, failed: 0 };
    a[r.user_id].cost += Number(r.cost_usd);
    if (!r.ok) a[r.user_id].failed++;
    return a;
  }, {});
  const base = `/admin/users?${new URLSearchParams({ ...(q ? { q } : {}), ...(sp.plan ? { plan: sp.plan } : {}) }).toString()}`;

  return (
    <>
      <form className="mb-5 flex flex-wrap items-end gap-2" action="/admin/users">
        <Input name="q" defaultValue={q} placeholder="Search email or name" className="h-10 w-[280px]" aria-label="Search users" />
        <Select name="plan" defaultValue={sp.plan ?? "all"} className="h-10 w-[200px]" aria-label="Plan">
          <option value="all">All plans</option>
          {PLAN_TIERS.map((p) => (
            <option key={p} value={p}>{planInfo[p].name}</option>
          ))}
          <option value="paid">Any paid plan</option>
          <option value="requested">Waiting for a plan</option>
        </Select>
        <button className="h-10 rounded-md bg-ink px-4 text-[14px] font-semibold text-paper">Filter</button>
        <span className="ml-auto text-[13.5px] text-ink-3 num">{count ?? 0} users</span>
      </form>

      {profiles?.length ? (
        <Table head={["User", "Plan", "Joined", "Last sign-in", "Profile", "Applications", "AI, 30 days", ""]} min={980}>
          {profiles.map((p) => {
            const sub = subBy.get(p.id);
            const cand = candBy.get(p.id);
            const a = auth.get(p.id);
            const c = costBy[p.id];
            return (
              <tr key={p.id}>
                <Td>
                  <Link href={`/admin/users/${p.id}`} className="font-semibold hover:underline">{p.email}</Link>
                  <p className="text-[12.5px] text-ink-3">{p.full_name ?? "No name"}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {p.role === "admin" ? <Tag tone="tape">Admin</Tag> : null}
                    {a && !a.confirmed ? <Tag tone="possible">Email not confirmed</Tag> : null}
                    {a?.bannedUntil ? <Tag tone="block">Suspended</Tag> : null}
                  </div>
                </Td>
                <Td>
                  <PlanTag plan={effectivePlan(sub)} />
                  {sub?.requested_plan ? <p className="mt-1 text-[12.5px] text-possible">Wants {planInfo[sub.requested_plan as "pro"].name}</p> : null}
                  {sub?.current_period_end ? <p className="mt-1 text-[12.5px] text-ink-3">until {shortDate(sub.current_period_end)}</p> : null}
                </Td>
                <Td className="whitespace-nowrap">{shortDate(p.created_at)}</Td>
                <Td className="whitespace-nowrap">{a?.lastSignIn ? relativeDate(a.lastSignIn) : "Never"}</Td>
                <Td>
                  {cand?.confirmed_at ? <Tag tone="strong">Confirmed</Tag> : cand?.source_resume_id ? <Tag tone="possible">Not confirmed</Tag> : <Tag>No resume</Tag>}
                  {cand?.headline ? <p className="mt-1 line-clamp-1 max-w-[200px] text-[12.5px] text-ink-3">{cand.headline}</p> : null}
                </Td>
                <Td className="num">{appCount[p.id] ? `${appCount[p.id].all} (${appCount[p.id].applied} sent)` : "0"}</Td>
                <Td className="num">
                  {c ? `$${c.cost.toFixed(2)}` : "$0.00"}
                  {c?.failed ? <span className="block text-[12.5px] text-block">{c.failed} failed</span> : null}
                </Td>
                <Td>
                  <Link href={`/admin/users/${p.id}`} className="text-[13px] font-semibold underline underline-offset-2">Manage</Link>
                </Td>
              </tr>
            );
          })}
        </Table>
      ) : (
        <Empty>No users match.</Empty>
      )}
      <Pager page={page} hasMore={(count ?? 0) > page * PER_PAGE} base={base} />
    </>
  );
}
