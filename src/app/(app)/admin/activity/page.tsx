import type { Metadata } from "next";
import Link from "next/link";
import { ACTION_LABEL, Empty, Pager, Table, Td, UserLink } from "@/components/admin-ui";
import { cx, Input, Select, Tag } from "@/components/ui";
import { relativeDate } from "@/lib/format";
import { emailsFor } from "@/lib/services/admin-data";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Admin · Activity" };
export const dynamic = "force-dynamic";

const PER_PAGE = 100;

export default async function AdminActivity({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; actor?: string; action?: string; user?: string; ok?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const type = sp.type === "ai" ? "ai" : "events";
  const page = Math.max(1, Number(sp.page) || 1);
  const db = createAdminClient();

  let userId: string | null = null;
  if (sp.user) {
    const { data } = await db.from("profiles").select("id").ilike("email", `%${sp.user.replace(/[%,()]/g, "")}%`).limit(1).maybeSingle();
    userId = data?.id ?? "00000000-0000-0000-0000-000000000000";
  }

  const from = (page - 1) * PER_PAGE;
  let rows: Record<string, unknown>[] = [];
  let total = 0;
  if (type === "events") {
    let q = db.from("audit_logs").select("id, user_id, actor, action, entity, entity_id, metadata, created_at", { count: "exact" }).order("created_at", { ascending: false });
    if (sp.actor) q = q.eq("actor", sp.actor);
    if (sp.action) q = q.ilike("action", `${sp.action.replace(/[%,()]/g, "")}%`);
    if (userId) q = q.eq("user_id", userId);
    const { data, count } = await q.range(from, from + PER_PAGE - 1);
    rows = data ?? [];
    total = count ?? 0;
  } else {
    let q = db.from("ai_usage").select("id, user_id, feature, provider, model, input_tokens, output_tokens, cost_usd, ok, created_at", { count: "exact" }).order("created_at", { ascending: false });
    if (sp.ok === "false") q = q.eq("ok", false);
    if (sp.action) q = q.ilike("feature", `${sp.action.replace(/[%,()]/g, "")}%`);
    if (userId) q = q.eq("user_id", userId);
    const { data, count } = await q.range(from, from + PER_PAGE - 1);
    rows = data ?? [];
    total = count ?? 0;
  }
  const emails = await emailsFor(db, rows.map((r) => r.user_id as string));
  const params = new URLSearchParams(Object.entries({ type, actor: sp.actor, action: sp.action, user: sp.user, ok: sp.ok }).filter(([, v]) => v) as [string, string][]);

  return (
    <>
      <div className="mb-4 flex gap-2">
        {[
          { t: "events", l: "Events" },
          { t: "ai", l: "AI calls" },
        ].map((x) => (
          <Link key={x.t} href={`/admin/activity?type=${x.t}`} className={cx("rounded-md px-3 py-1.5 text-[14px]", type === x.t ? "bg-ink font-semibold text-paper" : "bg-sunken text-ink-2 hover:text-ink")}>
            {x.l}
          </Link>
        ))}
      </div>
      <form className="mb-5 flex flex-wrap items-end gap-2" action="/admin/activity">
        <input type="hidden" name="type" value={type} />
        <Input name="user" defaultValue={sp.user} placeholder="User email" className="h-10 w-[220px]" aria-label="User email" />
        <Input name="action" defaultValue={sp.action} placeholder={type === "ai" ? "Feature, e.g. tailor" : "Action, e.g. plan. or ai.error"} className="h-10 w-[240px]" aria-label="Action" />
        {type === "events" ? (
          <Select name="actor" defaultValue={sp.actor ?? ""} className="h-10 w-[140px]" aria-label="Who">
            <option value="">Anyone</option>
            <option value="user">Users</option>
            <option value="system">System</option>
            <option value="admin">Admins</option>
          </Select>
        ) : (
          <Select name="ok" defaultValue={sp.ok ?? ""} className="h-10 w-[140px]" aria-label="Result">
            <option value="">All calls</option>
            <option value="false">Failed only</option>
          </Select>
        )}
        <button className="h-10 rounded-md bg-ink px-4 text-[14px] font-semibold text-paper">Filter</button>
        <span className="ml-auto text-[13.5px] text-ink-3 num">{total} records</span>
      </form>

      {!rows.length ? (
        <Empty>Nothing matches.</Empty>
      ) : type === "events" ? (
        <Table head={["When", "What", "User", "Who", "Details"]} min={900}>
          {rows.map((r) => (
            <tr key={r.id as string}>
              <Td className="whitespace-nowrap text-ink-2">{relativeDate(r.created_at as string)}</Td>
              <Td>
                <span className="font-medium">{ACTION_LABEL[r.action as string] ?? (r.action as string)}</span>
                <p className="text-[12px] text-ink-3">{r.action as string}</p>
              </Td>
              <Td>
                <UserLink id={r.user_id as string} email={emails.get(r.user_id as string)} />
              </Td>
              <Td>{r.actor === "user" ? "User" : <Tag>{r.actor as string}</Tag>}</Td>
              <Td className="max-w-[420px]">
                {r.entity ? (
                  <p className="text-[12.5px] text-ink-3">
                    {r.entity as string}{" "}
                    {r.entity === "job" && r.entity_id ? <Link href={`/jobs/${r.entity_id}`} className="underline">open</Link> : (r.entity_id as string)?.slice(0, 8)}
                  </p>
                ) : null}
                {r.metadata && Object.keys(r.metadata as object).length ? (
                  <p className={cx("break-words text-[12.5px]", r.action === "ai.error" ? "text-block" : "text-ink-2")}>{JSON.stringify(r.metadata)}</p>
                ) : null}
              </Td>
            </tr>
          ))}
        </Table>
      ) : (
        <Table head={["When", "Feature", "User", "Model", "Tokens in / out", "Cost", "Result"]} min={900}>
          {rows.map((r) => (
            <tr key={r.id as string}>
              <Td className="whitespace-nowrap text-ink-2">{relativeDate(r.created_at as string)}</Td>
              <Td>{r.feature as string}</Td>
              <Td>
                <UserLink id={r.user_id as string} email={emails.get(r.user_id as string)} />
              </Td>
              <Td className="text-ink-2">{r.provider === "template" ? "template (no AI)" : (r.model as string)}</Td>
              <Td className="num">
                {r.input_tokens as number} / {r.output_tokens as number}
              </Td>
              <Td className="num">${Number(r.cost_usd).toFixed(4)}</Td>
              <Td>{r.ok ? <Tag tone="strong">ok</Tag> : <Tag tone="block">failed</Tag>}</Td>
            </tr>
          ))}
        </Table>
      )}
      <Pager page={page} hasMore={total > page * PER_PAGE} base={`/admin/activity?${params.toString()}`} />
      {type === "ai" ? <p className="mt-3 text-[13px] text-ink-3">The reason for a failed call is in Events, under the action “ai.error”.</p> : null}
    </>
  );
}
