import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyButton } from "@/components/builder-editors";
import { PlanUpsell } from "@/components/plans";
import { InterviewPrepForm } from "@/components/premium-forms";
import { Notice, PageHeader, Panel, SectionTitle, Tag } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { planFeatures } from "@/lib/config";
import { relativeDate } from "@/lib/format";
import { getAllowance } from "@/lib/services/usage";
import type { InterviewPrep } from "@/lib/tailoring/premium";
import type { GuardWarning } from "@/lib/tailoring/guard";

export const metadata: Metadata = { title: "Interview prep" };

export default async function InterviewPrepPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase, user } = await requireUser();
  const [{ data: job }, { data: extra }, allowance] = await Promise.all([
    supabase.from("jobs").select("id, title, employer_name").eq("id", id).maybeSingle(),
    supabase.from("application_extras").select("content, warnings, updated_at").eq("user_id", user.id).eq("job_id", id).eq("kind", "interview_prep").maybeSingle(),
    getAllowance(supabase, user.id, "interview_prep").catch(() => null),
  ]);
  if (!job) notFound();
  const enabled = planFeatures[allowance?.plan ?? "free"].interviewPrep;
  const prep = extra?.content as InterviewPrep | undefined;
  const warnings = (extra?.warnings ?? []) as GuardWarning[];
  const left = allowance ? Math.max(0, allowance.limit - allowance.used) + allowance.credits : 0;

  const header = (
    <PageHeader
      title="Interview prep"
      description={
        <>
          For <Link href={`/jobs/${id}`} className="font-semibold text-ink underline underline-offset-2">{job.title}</Link> at {job.employer_name}
        </>
      }
      actions={<Tag tone="tape">Premium</Tag>}
    />
  );

  if (!enabled && !prep) {
    return (
      <>
        {header}
        <div className="max-w-[720px]">
          <PlanUpsell needs="premium" title="Walk into the interview prepared">
            Premium reads this job and your profile, then gives you 12–15 likely interview questions with answers built from your real experience, the topics to revise, how to talk about any gaps, and good questions to ask them.
          </PlanUpsell>
        </div>
      </>
    );
  }

  if (!prep) {
    return (
      <>
        {header}
        <Panel className="max-w-[720px] p-6">
          <h2 className="text-[18px] font-bold">What you'll get</h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-ink-2">
            <li>12–15 questions this interviewer is likely to ask, and why they ask them</li>
            <li>A suggested answer to each, using only your real roles and results</li>
            <li>Topics to revise, and honest ways to talk about any gaps</li>
            <li>Good questions for you to ask at the end</li>
          </ul>
          <div className="mt-6">
            {left === 0 ? <Notice tone="warn">You've used this month's interview preps. They reset on the 1st.</Notice> : <InterviewPrepForm jobId={id} />}
            {left > 0 ? <p className="mt-3 text-[13.5px] text-ink-3 num">{left} interview prep{left === 1 ? "" : "s"} left this month.</p> : null}
          </div>
        </Panel>
      </>
    );
  }

  const categories = Array.from(new Set(prep.questions.map((q) => q.category)));
  const asText = prep.questions.map((q, i) => `${i + 1}. ${q.question}\n${q.answer}`).join("\n\n");

  return (
    <>
      {header}
      <div className="flex max-w-[860px] flex-col gap-10">
        <div>
          <p className="text-[15.5px] leading-relaxed">{prep.overview}</p>
          <p className="mt-2 text-[13px] text-ink-3">Prepared {relativeDate(extra?.updated_at)}. Answers are suggestions to rehearse in your own words, not a script.</p>
        </div>

        {warnings.length ? (
          <Notice tone="warn">
            <p className="font-semibold">Check these against your real experience</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {warnings.map((w, i) => (
                <li key={i}>
                  <span className="font-medium">{w.where}:</span> {w.message}
                </li>
              ))}
            </ul>
          </Notice>
        ) : null}

        {prep.focusAreas.length ? (
          <section>
            <SectionTitle>Revise before the interview</SectionTitle>
            <ul className="flex flex-wrap gap-2">
              {prep.focusAreas.map((f) => (
                <li key={f} className="rounded-md border border-line bg-surface px-3 py-1.5 text-[14px]">{f}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {categories.map((cat) => (
          <section key={cat}>
            <SectionTitle>{cat}</SectionTitle>
            <div className="flex flex-col gap-3">
              {prep.questions
                .filter((q) => q.category === cat)
                .map((q, i) => (
                  <details key={i} className="group rounded-[10px] border border-line bg-surface open:border-line-strong">
                    <summary className="cursor-pointer list-none px-5 py-4 font-semibold marker:hidden">
                      <span className="mr-2 inline-block text-ink-3 transition-transform group-open:rotate-90">›</span>
                      {q.question}
                    </summary>
                    <div className="border-t border-line px-5 py-4">
                      <p className="text-[13.5px] text-ink-3">Why they ask: {q.whyTheyAsk}</p>
                      <p className="mt-3 whitespace-pre-line text-[14.5px] leading-relaxed">{q.answer}</p>
                      <div className="mt-3">
                        <CopyButton text={q.answer} label="Copy answer" />
                      </div>
                    </div>
                  </details>
                ))}
            </div>
          </section>
        ))}

        {prep.gapsToPrepare.length ? (
          <section>
            <SectionTitle>Gaps they may ask about</SectionTitle>
            <ul className="space-y-3">
              {prep.gapsToPrepare.map((g, i) => (
                <li key={i}>
                  <p className="font-semibold">{g.gap}</p>
                  <p className="text-[14.5px] text-ink-2">{g.howToAddress}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {prep.questionsToAsk.length ? (
          <section>
            <SectionTitle>Questions to ask them</SectionTitle>
            <ul className="list-disc space-y-1.5 pl-5">
              {prep.questionsToAsk.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="flex flex-wrap items-start gap-3 border-t border-line pt-6">
          <CopyButton text={asText} label="Copy all questions and answers" />
          {enabled && left > 0 ? <InterviewPrepForm jobId={id} again /> : null}
        </div>
      </div>
    </>
  );
}
