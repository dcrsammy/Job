import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  adminConfirmEmail,
  adminDeclineRequest,
  adminDeleteUser,
  adminRematchUser,
  adminResetLink,
  adminSetApplicationStatus,
  adminSetBanned,
  adminSetCredits,
  adminSetPlan,
  adminSetRole,
  adminWipeResume,
} from "@/app/actions/admin";
import { AdminAction } from "@/components/admin-forms";
import { ACTION_LABEL, Empty, PlanTag, Table, Td } from "@/components/admin-ui";
import { Panel, SectionTitle, Tag } from "@/components/ui";
import { effectivePlan, PLAN_TIERS, planInfo, planLimits, type MeteredFeature } from "@/lib/config";
import { relativeDate, shortDate, STATUS_LABEL } from "@/lib/format";
import { authInfo } from "@/lib/services/admin-data";
import { FEATURE_LABEL } from "@/lib/services/usage";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Admin · User" };
export const dynamic = "force-dynamic";

const sel = "h-8 rounded border border-line-strong bg-surface px-1.5 text-[12.5px]";

export default async function AdminUser({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const db = createAdminClient();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

  const [
    { data: profile },
    { data: sub },
    { data: cand },
    { data: resumes },
    { count: skills },
    { data: exps },
    { data: edus },
    { count: matchCount },
    { data: topMatches },
    { data: apps },
    { data: tailored },
    { data: extras },
    { data: usage },
    { data: monthUsage },
    { data: logs },
    auth,
  ] = await Promise.all([
    db.from("profiles").select("*").eq("id", id).maybeSingle(),
    db.from("subscriptions").select("*").eq("user_id", id).maybeSingle(),
    db.from("candidate_profiles").select("headline, years_experience, seniority, base_country, authorized_countries, needs_sponsorship, remote_preference, salary_min, salary_currency, role_families, confirmed_at, updated_at").eq("user_id", id).maybeSingle(),
    db.from("resumes").select("id, file_name, status, parse_error, created_at, is_primary, delete_after").eq("user_id", id).order("created_at", { ascending: false }),
    db.from("candidate_skills").select("id", { count: "exact", head: true }).eq("user_id", id),
    db.from("experiences").select("title, employer, start_date, end_date, is_current").eq("user_id", id).order("start_date", { ascending: false }).limit(12),
    db.from("educations").select("kind, institution, qualification").eq("user_id", id).limit(8),
    db.from("job_matches").select("job_id", { count: "exact", head: true }).eq("user_id", id),
    db.from("job_matches").select("score, band, job_id, computed_at, jobs(title, employer_name, is_active)").eq("user_id", id).order("score", { ascending: false }).limit(10),
    db.from("applications").select("id, job_id, status, applied_at, updated_at, auto_closed_reason, jobs(title, employer_name, is_active)").eq("user_id", id).order("updated_at", { ascending: false }).limit(50),
    db.from("tailored_applications").select("id, job_id, model, fabrication_warnings, created_at, jobs(title, employer_name)").eq("user_id", id).order("created_at", { ascending: false }).limit(20),
    db.from("application_extras").select("kind, job_id, model, updated_at, jobs(title, employer_name)").eq("user_id", id).order("updated_at", { ascending: false }).limit(20),
    db.from("ai_usage").select("feature, provider, model, input_tokens, output_tokens, cost_usd, ok, created_at").eq("user_id", id).order("created_at", { ascending: false }).limit(25),
    db.from("ai_usage").select("feature, ok, cost_usd").eq("user_id", id).gte("created_at", monthStart),
    db.from("audit_logs").select("id, actor, action, metadata, created_at").eq("user_id", id).order("created_at", { ascending: false }).limit(40),
    authInfo(db, [id]),
  ]);
  if (!profile) notFound();

  const a = auth.get(id);
  const plan = effectivePlan(sub);
  const used = (monthUsage ?? []).filter((u) => u.ok).reduce<Record<string, number>>((m, u) => ((m[u.feature] = (m[u.feature] ?? 0) + 1), m), {});
  const lifetimeCost = (usage ?? []).reduce((s, u) => s + Number(u.cost_usd), 0);
  const features = Object.keys(planLimits.free) as MeteredFeature[];
  const one = <T,>(x: T | T[] | null | undefined): T | undefined => (Array.isArray(x) ? x[0] : x ?? undefined);

  return (
    <>
      <p className="mb-2 text-[13.5px]">
        <Link href="/admin/users" className="underline underline-offset-2">← All users</Link>
      </p>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-[24px] font-bold">{profile.email}</h2>
          <p className="text-ink-2">
            {profile.full_name ?? "No name"} · joined {shortDate(profile.created_at)} · last sign-in {a?.lastSignIn ? relativeDate(a.lastSignIn) : "never"}
            {a?.provider ? ` · via ${a.provider}` : ""}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <PlanTag plan={plan} />
            {profile.role === "admin" ? <Tag tone="tape">Admin</Tag> : null}
            {a && !a.confirmed ? <Tag tone="possible">Email not confirmed</Tag> : null}
            {a?.bannedUntil ? <Tag tone="block">Suspended</Tag> : null}
            <span className="text-[12.5px] text-ink-3">ID {id}</span>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel className="p-5">
          <h3 className="mb-3 text-[16px] font-bold">Plan</h3>
          <dl className="grid grid-cols-[140px_1fr] gap-y-1.5 text-[14px]">
            <dt className="text-ink-2">Active plan</dt>
            <dd><PlanTag plan={plan} /></dd>
            <dt className="text-ink-2">Stored</dt>
            <dd>{sub ? `${planInfo[(sub.plan as "free") ?? "free"]?.name ?? sub.plan}, ${sub.status}${sub.provider ? `, ${sub.provider}` : ""}` : "No subscription row"}</dd>
            <dt className="text-ink-2">Ends</dt>
            <dd>{sub?.current_period_end ? `${shortDate(sub.current_period_end)}${new Date(sub.current_period_end) < new Date() ? " (expired)" : ""}` : "No end date"}</dd>
            <dt className="text-ink-2">Requested</dt>
            <dd>{sub?.requested_plan ? `${planInfo[sub.requested_plan as "pro"].name}, ${relativeDate(sub.requested_at)}` : "Nothing"}</dd>
            <dt className="text-ink-2">Credits</dt>
            <dd className="num">{sub?.credits ?? 0}</dd>
          </dl>
          <div className="mt-5 flex flex-col gap-4 border-t border-line pt-4">
            <AdminAction action={adminSetPlan} fields={{ userId: id }} label="Set plan" variant="primary" inline>
              <select name="plan" defaultValue={sub?.requested_plan ?? plan} className={sel} aria-label="Plan">
                {PLAN_TIERS.map((p) => (
                  <option key={p} value={p}>{planInfo[p].name}</option>
                ))}
              </select>
              <select name="days" defaultValue="30" className={sel} aria-label="For how long">
                <option value="30">for 30 days</option>
                <option value="90">for 90 days</option>
                <option value="365">for 1 year</option>
                <option value="0">with no end date</option>
              </select>
            </AdminAction>
            {sub?.requested_plan ? <AdminAction action={adminDeclineRequest} fields={{ userId: id }} label="Decline their request" variant="ghost" /> : null}
            <AdminAction action={adminSetCredits} fields={{ userId: id }} label="Set credits" inline>
              <input name="credits" type="number" min={0} defaultValue={sub?.credits ?? 0} className={`${sel} w-24`} aria-label="Credits" />
            </AdminAction>
          </div>
        </Panel>

        <Panel className="p-5">
          <h3 className="mb-3 text-[16px] font-bold">Fix their account</h3>
          <div className="flex flex-col gap-3.5">
            <div>
              <AdminAction action={adminResetLink} fields={{ userId: id }} label="Make a password reset link" />
              <p className="mt-1 text-[12.5px] text-ink-3">For when the reset email doesn't arrive. Copy the link and send it to them.</p>
            </div>
            {a && !a.confirmed ? <AdminAction action={adminConfirmEmail} fields={{ userId: id }} label="Mark email as confirmed" /> : null}
            <div>
              <AdminAction action={adminRematchUser} fields={{ userId: id }} label="Re-run job matching" pending="Matching… up to a minute" />
              <p className="mt-1 text-[12.5px] text-ink-3">Rebuilds their recommended jobs from their current profile.</p>
            </div>
            <AdminAction
              action={adminSetRole}
              fields={{ userId: id, role: profile.role === "admin" ? "user" : "admin" }}
              label={profile.role === "admin" ? "Remove admin access" : "Make admin"}
              confirm={profile.role === "admin" ? "Remove admin access?" : "Give this person full admin access?"}
            />
            <AdminAction
              action={adminSetBanned}
              fields={{ userId: id, banned: a?.bannedUntil ? "false" : "true" }}
              label={a?.bannedUntil ? "Lift suspension" : "Suspend account"}
              confirm={a?.bannedUntil ? undefined : "Suspend this account? They won't be able to sign in."}
            />
            <AdminAction action={adminWipeResume} fields={{ userId: id }} label="Delete resume and profile data" confirm="Delete their resume files, profile and matches? Their account and tracker stay." />
            <details className="rounded-md border border-block/40 p-3">
              <summary className="cursor-pointer text-[13.5px] font-semibold text-block">Delete account</summary>
              <div className="mt-3">
                <AdminAction action={adminDeleteUser} fields={{ userId: id }} label="Delete permanently" variant="danger">
                  <input name="confirm" placeholder="Type their email to confirm" className={`${sel} w-[240px]`} aria-label="Type their email to confirm" />
                </AdminAction>
              </div>
            </details>
          </div>
        </Panel>
      </div>

      <section className="mt-10">
        <SectionTitle aside={<span className="text-[13px] text-ink-3 num">AI cost, last 25 calls: ${lifetimeCost.toFixed(3)}</span>}>Usage this month</SectionTitle>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-line bg-line sm:grid-cols-3">
          {features.map((f) => {
            const limit = planLimits[plan][f];
            return (
              <div key={f} className="bg-surface px-4 py-3">
                <span className="text-[20px] font-bold num">{used[f] ?? 0}</span>
                <span className="text-ink-3 num"> / {limit || "not included"}</span>
                <span className="block text-[13px] text-ink-2 first-letter:uppercase">{FEATURE_LABEL[f]}</span>
              </div>
            );
          })}
        </div>
      </section>

      <div className="mt-10 grid gap-10 lg:grid-cols-2">
        <section>
          <SectionTitle>Career profile</SectionTitle>
          <Panel className="p-5 text-[14px]">
            {cand ? (
              <>
                <p className="font-semibold">{cand.headline ?? "No headline"}</p>
                <p className="text-ink-2">
                  {cand.years_experience ?? "?"} years · {cand.seniority} · based in {cand.base_country ?? "?"} · authorised in {(cand.authorized_countries ?? []).join(", ") || "?"} · sponsorship{" "}
                  {cand.needs_sponsorship == null ? "?" : cand.needs_sponsorship ? "needed" : "not needed"}
                </p>
                <p className="text-ink-2">
                  {skills ?? 0} skills · {cand.remote_preference} · salary {cand.salary_min ? `${cand.salary_currency} ${cand.salary_min}` : "not set"} · {cand.confirmed_at ? `confirmed ${relativeDate(cand.confirmed_at)}` : "not confirmed"}
                </p>
                {exps?.length ? (
                  <ul className="mt-3 space-y-1">
                    {exps.map((e, i) => (
                      <li key={i}>
                        {e.title} <span className="text-ink-2">at {e.employer}</span>{" "}
                        <span className="text-ink-3">({e.start_date?.slice(0, 7) ?? "?"} – {e.is_current ? "now" : e.end_date?.slice(0, 7) ?? "?"})</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-ink-3">No work history.</p>
                )}
                {edus?.length ? <p className="mt-2 text-ink-2">{edus.map((e) => [e.qualification, e.institution].filter(Boolean).join(", ")).join(" · ")}</p> : null}
              </>
            ) : (
              <p className="text-ink-2">No profile.</p>
            )}
          </Panel>
          <h4 className="mt-5 mb-2 font-semibold">Resume files</h4>
          {resumes?.length ? (
            <ul className="divide-y divide-line rounded-[10px] border border-line bg-surface text-[13.5px]">
              {resumes.map((r) => (
                <li key={r.id} className="px-4 py-2.5">
                  <span className="font-medium">{r.file_name}</span> {r.is_primary ? <Tag>current</Tag> : null}{" "}
                  <Tag tone={r.status === "failed" ? "block" : r.status === "parsed" ? "strong" : "neutral"}>{r.status}</Tag>
                  <span className="ml-2 text-ink-3">{relativeDate(r.created_at)}</span>
                  {r.parse_error ? <p className="text-block">{r.parse_error}</p> : null}
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No resume uploaded.</Empty>
          )}
        </section>

        <section>
          <SectionTitle aside={<span className="text-[13px] text-ink-3 num">{matchCount ?? 0} matches stored</span>}>Top matches</SectionTitle>
          {topMatches?.length ? (
            <ul className="divide-y divide-line rounded-[10px] border border-line bg-surface text-[13.5px]">
              {topMatches.map((m) => {
                const j = one(m.jobs as unknown as { title: string; employer_name: string; is_active: boolean });
                return (
                  <li key={m.job_id} className="flex items-baseline gap-3 px-4 py-2.5">
                    <span className="w-8 font-bold num">{m.score}</span>
                    <Link href={`/jobs/${m.job_id}`} className="min-w-0 flex-1 truncate hover:underline">
                      {j?.title} <span className="text-ink-2">· {j?.employer_name}</span>
                    </Link>
                    {!j?.is_active ? <Tag tone="low">closed</Tag> : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty>No matches yet.</Empty>
          )}
          {topMatches?.[0] ? <p className="mt-2 text-[12.5px] text-ink-3">Last computed {relativeDate(topMatches[0].computed_at)}</p> : null}
        </section>
      </div>

      <section className="mt-10">
        <SectionTitle>Applications</SectionTitle>
        {apps?.length ? (
          <Table head={["Job", "Status", "Applied", "Updated", "Change status"]} min={820}>
            {apps.map((ap) => {
              const j = one(ap.jobs as unknown as { title: string; employer_name: string; is_active: boolean });
              return (
                <tr key={ap.id}>
                  <Td>
                    <Link href={`/jobs/${ap.job_id}`} className="hover:underline">{j?.title}</Link>
                    <p className="text-[12.5px] text-ink-3">{j?.employer_name}{!j?.is_active ? " · listing closed" : ""}</p>
                  </Td>
                  <Td>
                    {STATUS_LABEL[ap.status]}
                    {ap.auto_closed_reason ? <p className="text-[12.5px] text-ink-3">{ap.auto_closed_reason}</p> : null}
                  </Td>
                  <Td className="whitespace-nowrap">{ap.applied_at ? shortDate(ap.applied_at) : "–"}</Td>
                  <Td className="whitespace-nowrap">{relativeDate(ap.updated_at)}</Td>
                  <Td>
                    <AdminAction action={adminSetApplicationStatus} fields={{ id: ap.id }} label="Save" inline>
                      <select name="status" defaultValue={ap.status} className={sel} aria-label="Status">
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
      </section>

      <div className="mt-10 grid gap-10 lg:grid-cols-2">
        <section>
          <SectionTitle>Documents generated</SectionTitle>
          <ul className="divide-y divide-line rounded-[10px] border border-line bg-surface text-[13.5px]">
            {(tailored ?? []).map((t) => {
              const j = one(t.jobs as unknown as { title: string; employer_name: string });
              const w = ((t.fabrication_warnings as unknown[]) ?? []).length;
              return (
                <li key={t.id} className="px-4 py-2.5">
                  <span className="font-medium">Application</span> · {j?.title} at {j?.employer_name}
                  <p className="text-ink-3">
                    {t.model} · {relativeDate(t.created_at)}
                    {w ? <span className="text-possible"> · {w} accuracy warnings</span> : null}
                  </p>
                </li>
              );
            })}
            {(extras ?? []).map((x, i) => {
              const j = one(x.jobs as unknown as { title: string; employer_name: string });
              return (
                <li key={`x${i}`} className="px-4 py-2.5">
                  <span className="font-medium">{x.kind === "interview_prep" ? "Interview prep" : "Follow-up email"}</span> · {j?.title} at {j?.employer_name}
                  <p className="text-ink-3">{x.model} · {relativeDate(x.updated_at)}</p>
                </li>
              );
            })}
            {!tailored?.length && !extras?.length ? <li className="px-4 py-3 text-ink-2">Nothing yet.</li> : null}
          </ul>

          <h4 className="mt-8 mb-2 font-semibold">AI calls</h4>
          <ul className="divide-y divide-line rounded-[10px] border border-line bg-surface text-[13px]">
            {(usage ?? []).map((u, i) => (
              <li key={i} className="flex justify-between gap-3 px-4 py-2 num">
                <span>
                  {u.feature} <span className="text-ink-3">· {u.model}</span> {!u.ok ? <Tag tone="block">failed</Tag> : null}
                </span>
                <span className="shrink-0 text-ink-2">
                  {u.input_tokens + u.output_tokens} tok · ${Number(u.cost_usd).toFixed(4)} · {relativeDate(u.created_at)}
                </span>
              </li>
            ))}
            {!usage?.length ? <li className="px-4 py-3 text-ink-2">No AI calls.</li> : null}
          </ul>
        </section>

        <section>
          <SectionTitle>Activity</SectionTitle>
          <ul className="divide-y divide-line rounded-[10px] border border-line bg-surface text-[13px]">
            {(logs ?? []).map((l) => (
              <li key={l.id} className="px-4 py-2">
                <div className="flex justify-between gap-3">
                  <span>
                    <span className="font-medium">{ACTION_LABEL[l.action] ?? l.action}</span> {l.actor !== "user" ? <Tag>{l.actor}</Tag> : null}
                  </span>
                  <span className="shrink-0 text-ink-3">{relativeDate(l.created_at)}</span>
                </div>
                {l.metadata && Object.keys(l.metadata).length ? <p className="truncate text-ink-3" title={JSON.stringify(l.metadata)}>{JSON.stringify(l.metadata)}</p> : null}
              </li>
            ))}
            {!logs?.length ? <li className="px-4 py-3 text-ink-2">No activity.</li> : null}
          </ul>
        </section>
      </div>
    </>
  );
}
