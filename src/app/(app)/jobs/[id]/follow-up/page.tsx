import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyButton } from "@/components/builder-editors";
import { PlanUpsell } from "@/components/plans";
import { FollowUpForm } from "@/components/premium-forms";
import { Notice, PageHeader, Panel, Tag } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { planFeatures } from "@/lib/config";
import { relativeDate, shortDate, STATUS_LABEL } from "@/lib/format";
import { getAllowance } from "@/lib/services/usage";
import type { FollowUpEmail } from "@/lib/tailoring/premium";
import type { GuardWarning } from "@/lib/tailoring/guard";

export const metadata: Metadata = { title: "Follow-up email" };

export default async function FollowUpPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase, user } = await requireUser();
  const [{ data: job }, { data: application }, { data: extra }, allowance] = await Promise.all([
    supabase.from("jobs").select("id, title, employer_name").eq("id", id).maybeSingle(),
    supabase.from("applications").select("status, applied_at").eq("user_id", user.id).eq("job_id", id).maybeSingle(),
    supabase.from("application_extras").select("content, warnings, updated_at").eq("user_id", user.id).eq("job_id", id).eq("kind", "follow_up").maybeSingle(),
    getAllowance(supabase, user.id, "follow_up").catch(() => null),
  ]);
  if (!job) notFound();
  const enabled = planFeatures[allowance?.plan ?? "free"].followUps;
  const email = extra?.content as FollowUpEmail | undefined;
  const warnings = (extra?.warnings ?? []) as GuardWarning[];
  const left = allowance ? Math.max(0, allowance.limit - allowance.used) + allowance.credits : 0;
  const days = application?.applied_at ? Math.floor((Date.now() - new Date(application.applied_at).getTime()) / 86_400_000) : null;

  return (
    <>
      <PageHeader
        title="Follow-up email"
        description={
          <>
            For <Link href={`/jobs/${id}`} className="font-semibold text-ink underline underline-offset-2">{job.title}</Link> at {job.employer_name}
            {application?.applied_at ? <> · applied {shortDate(application.applied_at)} ({days} days ago)</> : null}
          </>
        }
        actions={application ? <Tag tone="tape">{STATUS_LABEL[application.status]}</Tag> : <Tag tone="tape">Premium</Tag>}
      />
      <div className="flex max-w-[760px] flex-col gap-6">
        {!enabled && !email ? (
          <PlanUpsell needs="premium" title="Follow up without the awkwardness">
            Premium writes a short, polite follow-up email for applications that have gone quiet, with one specific reason you fit, taken from your real experience.
          </PlanUpsell>
        ) : null}

        {days != null && days < 7 && enabled ? (
          <Notice tone="info">It's usually best to wait about a week after applying before following up.</Notice>
        ) : null}

        {email ? (
          <Panel className="p-5">
            {warnings.length ? (
              <div className="mb-4">
                <Notice tone="warn">
                  {warnings.map((w, i) => (
                    <p key={i}>{w.message}</p>
                  ))}
                </Notice>
              </div>
            ) : null}
            <p className="text-[13px] text-ink-3">Subject</p>
            <p className="font-semibold">{email.subject}</p>
            <p className="mt-4 text-[13px] text-ink-3">Message</p>
            <p className="mt-1 whitespace-pre-line text-[14.5px] leading-relaxed">{email.body}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <CopyButton text={`${email.subject}\n\n${email.body}`} label="Copy email" />
              <a
                href={`mailto:?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`}
                className="inline-flex h-9 items-center rounded-md border border-line-strong bg-surface px-3 text-[13.5px] font-semibold hover:border-ink"
              >
                Open in my email app
              </a>
            </div>
            <p className="mt-3 text-[13px] text-ink-3">Written {relativeDate(extra?.updated_at)}. Send it to the recruiter or hiring manager if you have their address, or reply to the confirmation email you got when you applied.</p>
          </Panel>
        ) : null}

        {enabled ? (
          left === 0 ? (
            <Notice tone="warn">You've used this month's follow-up emails. They reset on the 1st.</Notice>
          ) : (
            <Panel className="p-5">
              <FollowUpForm jobId={id} again={!!email} />
              <p className="mt-3 text-[13.5px] text-ink-3 num">{left} follow-up email{left === 1 ? "" : "s"} left this month.</p>
            </Panel>
          )
        ) : null}
      </div>
    </>
  );
}
