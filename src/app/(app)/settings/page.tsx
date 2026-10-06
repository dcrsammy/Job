import type { Metadata } from "next";
import Link from "next/link";
import { cancelPlanRequest, requestPlan, wipeResumeData } from "@/app/actions/settings";
import { PlanCard } from "@/components/plans";
import { DeleteAccountForm, RetentionForm } from "@/components/settings-forms";
import { SubmitButton } from "@/components/submit-button";
import { Notice, PageHeader, Panel, SectionTitle } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { PLAN_TIERS, planInfo, type PlanTier } from "@/lib/config";
import { getAllowance } from "@/lib/services/usage";

export const metadata: Metadata = { title: "Settings & privacy" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ wiped?: string }> }) {
  const { supabase, user } = await requireUser();
  const sp = await searchParams;
  const [{ data: profile }, { data: sub }, parse, tailor] = await Promise.all([
    supabase.from("profiles").select("full_name, email, resume_retention_days, created_at").eq("id", user.id).single(),
    supabase.from("subscriptions").select("*").eq("user_id", user.id).maybeSingle(),
    getAllowance(supabase, user.id, "resume_parse").catch(() => null),
    getAllowance(supabase, user.id, "tailor").catch(() => null),
  ]);
  const plan: PlanTier = tailor?.plan ?? "free";
  const requested = (sub?.requested_plan ?? null) as PlanTier | null;
  const rank = (p: PlanTier) => PLAN_TIERS.indexOf(p);

  return (
    <>
      <PageHeader title="Settings & privacy" />
      {sp.wiped ? (
        <div className="mb-6">
          <Notice tone="ok">Your resume files and profile data have been deleted.</Notice>
        </div>
      ) : null}
      <div className="flex max-w-[980px] flex-col gap-10">
        <section>
          <SectionTitle>Account</SectionTitle>
          <Panel className="grid gap-1 p-5 text-[14.5px]">
            <p><span className="text-ink-2">Email:</span> {profile?.email ?? user.email}</p>
            <p><span className="text-ink-2">Name:</span> {profile?.full_name ?? "Not set"} <Link href="/profile" className="ml-1 underline underline-offset-2">Edit</Link></p>
            <p><Link href="/reset-password" className="underline underline-offset-2">Change password</Link></p>
          </Panel>
        </section>

        <section id="plan" className="scroll-mt-6">
          <SectionTitle>Plan</SectionTitle>
          {requested ? (
            <div className="mb-4">
              <Notice tone="info">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span>
                    You've asked for <strong>{planInfo[requested].name}</strong>. We'll switch you over as soon as it's activated. Until then you're on {planInfo[plan].name}.
                  </span>
                  <form action={cancelPlanRequest}>
                    <SubmitButton variant="ghost" className="h-8 px-2 text-[13px]" pending="Cancelling…">Cancel request</SubmitButton>
                  </form>
                </div>
              </Notice>
            </div>
          ) : null}
          <div className="grid gap-3 md:grid-cols-3">
            {PLAN_TIERS.map((p) => (
              <PlanCard
                key={p}
                plan={p}
                current={p === plan}
                footer={
                  p === plan ? (
                    sub?.current_period_end ? <p className="text-[13px] text-ink-3">Active until {new Date(sub.current_period_end).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</p> : null
                  ) : p === requested ? (
                    <p className="text-[13px] font-medium text-possible">Requested</p>
                  ) : (
                    <form action={requestPlan}>
                      <input type="hidden" name="plan" value={p} />
                      <SubmitButton
                        variant={rank(p) > rank(plan) ? "primary" : "secondary"}
                        className="w-full"
                        pending="Saving…"
                        confirm={p === "free" ? "Switch to Basic now? Pro and Premium features stop straight away." : undefined}
                      >
                        {rank(p) > rank(plan) ? `Upgrade to ${planInfo[p].name}` : `Switch to ${planInfo[p].name}`}
                      </SubmitButton>
                    </form>
                  )
                }
              />
            ))}
          </div>
        </section>

        <section>
          <SectionTitle>Usage this month</SectionTitle>
          <Panel className="p-5">
            <dl className="grid gap-3 sm:grid-cols-2">
              {[
                { label: "Resume analyses", a: parse },
                { label: "Tailored applications", a: tailor },
              ].map(({ label, a }) => (
                <div key={label}>
                  <dt className="text-[14px] text-ink-2">{label}</dt>
                  <dd className="num">
                    <span className="text-[20px] font-bold">{a?.used ?? 0}</span>
                    <span className="text-ink-3"> of {a?.limit ?? 0}</span>
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-[13.5px] text-ink-3">Matching and job search are unlimited on every plan. Allowances reset on the 1st of each month.</p>
          </Panel>
        </section>

        <section>
          <SectionTitle>How we use your data</SectionTitle>
          <div className="space-y-2 text-[14.5px] text-ink-2">
            <p>Your resume is stored privately. Only you can open it, and we use it only to build your profile, score jobs and draft your applications.</p>
            <p>When AI features are on, the text of your resume and the job description are sent to our AI provider to process your request. They aren't used to train models under our agreement with the provider.</p>
            <p>We never send applications for you, never share your profile with employers, and never sell your data. <Link href="/privacy" className="underline underline-offset-2">Read the full privacy notice</Link>.</p>
          </div>
        </section>

        <section>
          <SectionTitle>Your data</SectionTitle>
          <Panel className="flex flex-col gap-6 p-5">
            <RetentionForm days={profile?.resume_retention_days ?? null} />
            <div className="border-t border-line pt-5">
              <p className="font-semibold">Download everything</p>
              <p className="text-[14px] text-ink-2">A JSON file with your profile, matches, applications and activity.</p>
              <a href="/api/me/export" className="mt-2 inline-flex h-10 items-center rounded-md border border-line-strong bg-surface px-4 text-[14px] font-semibold hover:border-ink">Download my data</a>
            </div>
            <div className="border-t border-line pt-5">
              <p className="font-semibold">Delete my resume and profile data</p>
              <p className="text-[14px] text-ink-2">Removes uploaded files, extracted skills, work history, education and matches. Your account and application tracker stay.</p>
              <form action={wipeResumeData} className="mt-2">
                <SubmitButton variant="secondary" confirm="Delete your resume files and profile data? This can't be undone." pending="Deleting…">Delete resume data</SubmitButton>
              </form>
            </div>
          </Panel>
        </section>

        <section>
          <SectionTitle>Delete account</SectionTitle>
          <Panel className="border-block/40 p-5">
            <p className="mb-4 text-[14.5px] text-ink-2">Permanently deletes your account, files and every record linked to it. This can't be undone.</p>
            <DeleteAccountForm />
          </Panel>
        </section>
      </div>
    </>
  );
}
