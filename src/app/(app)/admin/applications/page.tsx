import type { Metadata } from "next";
import Link from "next/link";
import { adminSetApplicationStatus } from "@/app/actions/admin";
import { AdminAction } from "@/components/admin-forms";
import { Empty, Pager, Stats, Table, Td, UserLink } from "@/components/admin-ui";
import { Select, SectionTitle } from "@/components/ui";
import { relativeDate, shortDate, STATUS_LABEL } from "@/lib/format";
import { emailsFor, since } from "@/lib/services/admin-data";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Admin · Applications" };
export const dynamic = "force-dynamic";

const PER_PAGE = 50;
const sel = "h-8 rounded border border-line-strong bg-surface px-1.5 text-[12.5px]";

export default async function AdminApplications({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const db = createAdminClient();

  let q = db
    .from("applications")
    .select("id, user_id, job_id, status, applied_at, updated_at, auto_closed_reason, jobs(title, employer_name, is_active)", { count: "exact" })
    .order("updated_at", { ascending: false });
  if (sp.status && sp.status in STATUS_LABEL) q = q.eq("status", sp.status);
  const [{ data: apps, count }, { data: all }, { data: tailored }, { count: prepCount }, { count: followCount }] = await Promise.all([
    q.range((page - 1) * PER_PAGE, page * PER_PAGE - 1),
    db.from("applications").select("status").limit(50000),
    db.from("tailored_applications").select("id, user_id, job_id, model, fabrication_warnings, created_at, jobs(title, employer_name)").order("created_at", { ascending: false }).limit(15),
    db.from("application_extras").select("id", { count: "exact", head: true }).eq("kind", "interview_prep").gte("created_at", since(30)),
    db.from("application_extras").select("id", { count: "exact", head: true }).eq("kind", "follow_up").gte("created_at", since(30)),
  ]);
  const byStatus = (all ?? []).reduce<Record<string, number>>((a, r) => ((a[r.status] = (a[r.status] ?? 0) + 1), a), {});
  const emails = await emailsFor(db, [...(apps ?? []).map((a) => a.user_id), ...(tailored ?? []).map((t) => t.user_id)]);
  const one = <T,>(x: T | T[] | null | undefined): T | undefined => (Array.isArray(x) ? x[0] : x ?? undefined);

  return (
    <>
      <Stats
        items={[
          { n: (byStatus.preparing ?? 0) + (byStatus.interested ?? 0) + (byStatus.saved ?? 0), l: "Being prepared", href: "/admin/applications?status=preparing" },
          { n: byStatus.applied ?? 0, l: "Applied, waiting", href: "/admin/applications?status=applied" },
          { n: (byStatus.interview ?? 0) + (byStatus.offer ?? 0), l: `Interviewing or offer (${byStatus.offer ?? 0} offers)`, href: "/admin/applications?status=interview" },
          { n: `${prepCount ?? 0} / ${followCount ?? 0}`, l: "Interview preps / follow-ups, 30 days" },
        ]}
      />

      <form className="mb-4 flex items-end gap-2" action="/admin/applications">
        <Select name="status" defaultValue={sp.status ?? ""} className="h-10 w-[220px]" aria-label="Status">
          <option value="">Every status</option>
          {Object.entries(STATUS_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l} ({byStatus[v] ?? 0})</option>
          ))}
        </Select>
        <button className="h-10 rounded-md bg-ink px-4 text-[14px] font-semibold text-paper">Filter</button>
        <span className="ml-auto text-[13.5px] text-ink-3 num">{count ?? 0} applications</span>
      </form>

      {apps?.length ? (
        <Table head={["User", "Job", "Status", "Applied", "Updated", "Fix status"]} min={980}>
          {apps.map((a) => {
            const j = one(a.jobs as unknown as { title: string; employer_name: string; is_active: boolean });
            return (
              <tr key={a.id}>
                <Td>
                  <UserLink id={a.user_id} email={emails.get(a.user_id)} />
                </Td>
                <Td>
                  <Link href={`/jobs/${a.job_id}`} className="hover:underline">{j?.title}</Link>
                  <p className="text-[12.5px] text-ink-3">{j?.employer_name}{!j?.is_active ? " · listing closed" : ""}</p>
                </Td>
                <Td>
                  {STATUS_LABEL[a.status]}
                  {a.auto_closed_reason ? <p className="text-[12.5px] text-ink-3">{a.auto_closed_reason}</p> : null}
                </Td>
                <Td className="whitespace-nowrap">{a.applied_at ? shortDate(a.applied_at) : "–"}</Td>
                <Td className="whitespace-nowrap">{relativeDate(a.updated_at)}</Td>
                <Td>
                  <AdminAction action={adminSetApplicationStatus} fields={{ id: a.id }} label="Save" inline>
                    <select name="status" defaultValue={a.status} className={sel} aria-label="Status">
                      {Object.entries(STATUS_LABEL).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  </AdminAction>
                </Td>
              </tr>
            );
          })}
        </Table>
      ) : (
        <Empty>No applications.</Empty>
      )}
      <Pager page={page} hasMore={(count ?? 0) > page * PER_PAGE} base={`/admin/applications${sp.status ? `?status=${sp.status}` : ""}`} />

      <section className="mt-10">
        <SectionTitle>Latest application packages</SectionTitle>
        <ul className="divide-y divide-line rounded-[10px] border border-line bg-surface text-[13.5px]">
          {(tailored ?? []).map((t) => {
            const j = one(t.jobs as unknown as { title: string; employer_name: string });
            const w = ((t.fabrication_warnings as unknown[]) ?? []).length;
            return (
              <li key={t.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5">
                <span>
                  <UserLink id={t.user_id} email={emails.get(t.user_id)} /> · {j?.title} at {j?.employer_name}
                </span>
                <span className="text-ink-3">
                  {t.model} · {relativeDate(t.created_at)}
                  {w ? <span className="text-possible"> · {w} accuracy warnings</span> : null}
                </span>
              </li>
            );
          })}
          {!tailored?.length ? <li className="px-4 py-3 text-ink-2">None yet.</li> : null}
        </ul>
        <p className="mt-2 text-[13px] text-ink-3">“template” means AI was unavailable and the fill-it-yourself version was produced. Accuracy warnings are claims our checker removed or flagged.</p>
      </section>
    </>
  );
}
