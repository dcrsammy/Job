import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { markApplied, saveChecklist } from "@/app/actions/builder";
import { CopyButton, EmployerQuestionsForm, GenerateForm, TextEditor } from "@/components/builder-editors";
import { FitTape } from "@/components/fit-tape";
import { SubmitButton } from "@/components/submit-button";
import { cx, ExternalButton, Notice, PageHeader, Panel, SectionTitle, Tag } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { STATUS_LABEL } from "@/lib/format";
import { getAllowance } from "@/lib/services/usage";
import { planFeatures } from "@/lib/config";
import type { EvidenceItem } from "@/lib/tailoring/generate";
import type { GuardWarning } from "@/lib/tailoring/guard";

export const metadata: Metadata = { title: "Application builder" };

const STATUS_STYLE = {
  met: { label: "Evidence found", cls: "text-strong" },
  partial: { label: "Partial", cls: "text-possible" },
  missing: { label: "Missing", cls: "text-block" },
};

function DownloadLinks({ appId, doc }: { appId: string; doc: "resume" | "cover" }) {
  return (
    <span className="inline-flex gap-2">
      <a className="inline-flex h-9 items-center rounded-md px-2 text-[13.5px] font-semibold underline underline-offset-2" href={`/api/applications/${appId}/export?doc=${doc}&format=docx`}>Download Word</a>
      <a className="inline-flex h-9 items-center rounded-md px-2 text-[13.5px] font-semibold underline underline-offset-2" href={`/api/applications/${appId}/export?doc=${doc}&format=txt`}>Text</a>
    </span>
  );
}

function ProUpsell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[10px] border border-dashed border-line-strong p-5">
      <p className="flex items-center gap-2 font-semibold">
        <Tag tone="tape">Pro</Tag> {children}
      </p>
      <p className="mt-1 text-[14px] text-ink-2">
        Pro writes every answer in full: why you want the job, your strengths, salary, availability. It also answers the questions from the employer's own form. You review and edit before sending.
      </p>
    </div>
  );
}

export default async function ApplyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase, user } = await requireUser();
  const [{ data: job }, { data: app }, { data: match }, { data: application }, allowance] = await Promise.all([
    supabase.from("jobs").select("id, title, employer_name, apply_url, verification_status, job_sources(name)").eq("id", id).maybeSingle(),
    supabase.from("tailored_applications").select("*, cover_letters(content), application_answers(id, question, answer, needs_user_input, sort_order)").eq("user_id", user.id).eq("job_id", id).maybeSingle(),
    supabase.from("job_matches").select("score, band, disqualifiers, breakdown").eq("user_id", user.id).eq("job_id", id).maybeSingle(),
    supabase.from("applications").select("status").eq("user_id", user.id).eq("job_id", id).maybeSingle(),
    getAllowance(supabase, user.id, "tailor").catch(() => null),
  ]);
  if (!job) notFound();
  const features = planFeatures[allowance?.plan ?? "free"];
  const src = (job.job_sources as unknown as { name: string } | null)?.name;
  const applyLabel = job.verification_status === "official" ? `Apply on ${job.employer_name}'s site` : `Apply via ${src ?? "the job board"}`;

  const header = (
    <PageHeader
      title="Application builder"
      description={
        <>
          For <Link href={`/jobs/${id}`} className="font-semibold text-ink underline underline-offset-2">{job.title}</Link> at {job.employer_name}
        </>
      }
      actions={application ? <Tag tone="tape">{STATUS_LABEL[application.status]}</Tag> : null}
    />
  );

  if (!app) {
    const left = allowance ? Math.max(0, allowance.limit - allowance.used) + allowance.credits : null;
    return (
      <>
        {header}
        <Panel className="max-w-[720px] p-6">
          <h2 className="flex items-center gap-2 text-[18px] font-bold">What you'll get {features.completeAnswers ? <Tag tone="tape">Pro</Tag> : null}</h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-ink-2">
            <li>Each requirement in the listing matched to evidence from your profile, with gaps shown honestly</li>
            <li>A version of your resume reordered and reworded for this job, using only facts you've given us</li>
            {features.completeAnswers ? (
              <>
                <li>A complete cover letter, ready to send</li>
                <li>Full answers to 12–15 likely questions, including why you want the job, your strengths, salary and availability</li>
                <li>A list of anything we had to assume, such as a notice period, so you can check it</li>
              </>
            ) : (
              <>
                <li>A short cover letter draft with [placeholders] for the parts only you can write</li>
                <li>Likely application questions with suggested answers</li>
              </>
            )}
            <li>A final checklist to review before you apply</li>
          </ul>
          {!features.completeAnswers ? (
            <div className="mt-5">
              <ProUpsell>Want every answer written for you?</ProUpsell>
            </div>
          ) : null}
          {match?.disqualifiers?.length ? (
            <div className="mt-4">
              <Notice tone="warn">Before you spend time on this: {match.disqualifiers.join("; ")}.</Notice>
            </div>
          ) : null}
          <div className="mt-6">
            {left === 0 ? (
              <Notice tone="warn">You've used this month's tailored applications. They reset on the 1st.</Notice>
            ) : (
              <GenerateForm jobId={id} label="Prepare my application" />
            )}
            {left != null && left > 0 ? <p className="mt-3 text-[13.5px] text-ink-3 num">{left} tailored application{left === 1 ? "" : "s"} left this month.</p> : null}
          </div>
        </Panel>
      </>
    );
  }

  const evidence = (app.evidence_map ?? []) as EvidenceItem[];
  const warnings = (app.fabrication_warnings ?? []) as GuardWarning[];
  const checklist = (app.checklist ?? []) as { id: string; label: string; checked?: boolean }[];
  const answers = ((app.application_answers ?? []) as { id: string; question: string; answer: string; needs_user_input: boolean; sort_order: number }[]).sort((a, b) => a.sort_order - b.sort_order);
  const cover = (app.cover_letters as unknown as { content: string } | { content: string }[] | null);
  const coverText = Array.isArray(cover) ? cover[0]?.content ?? "" : cover?.content ?? "";
  const missing = (app.missing_info ?? []) as { question: string; why: string }[];
  const recs = (app.recommendations ?? []) as string[];
  const reviewed = app.status === "reviewed" || checklist.every((c) => c.checked);
  const needsInput = answers.filter((a) => a.needs_user_input).length;

  return (
    <>
      {header}
      <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
        <div className="flex min-w-0 flex-col gap-10">
          {warnings.length ? (
            <Notice tone="warn">
              <p className="font-semibold">Our accuracy check flagged {warnings.length} thing{warnings.length > 1 ? "s" : ""} to review</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {warnings.map((w, i) => (
                  <li key={i}>
                    <span className="font-medium">{w.where}:</span> {w.message}
                  </li>
                ))}
              </ul>
            </Notice>
          ) : null}

          <section aria-labelledby="ev">
            <SectionTitle>
              <span id="ev">Requirements and your evidence</span>
            </SectionTitle>
            <Panel as="div" className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-[14px]">
                <thead className="border-b border-line text-left text-ink-2">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">The job asks for</th>
                    <th className="px-4 py-2.5 font-semibold">Your evidence</th>
                    <th className="px-4 py-2.5 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {evidence.map((e, i) => (
                    <tr key={i} className="align-top">
                      <td className="px-4 py-3">
                        {e.requirement}
                        {e.importance === "preferred" ? <span className="block text-[12.5px] text-ink-3">Nice to have</span> : null}
                      </td>
                      <td className="px-4 py-3 text-ink-2">
                        {e.evidence.length ? e.evidence.join("; ") : "None in your profile"}
                        {e.note ? <span className="mt-1 block text-[13px] text-ink-3">{e.note}</span> : null}
                      </td>
                      <td className={cx("px-4 py-3 font-semibold whitespace-nowrap", STATUS_STYLE[e.status].cls)}>{STATUS_STYLE[e.status].label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </section>

          {recs.length ? (
            <section aria-labelledby="recs">
              <SectionTitle>
                <span id="recs">Suggested changes</span>
              </SectionTitle>
              <ul className="list-disc space-y-1.5 pl-5 text-ink-2">
                {recs.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <section aria-labelledby="cv">
            <SectionTitle aside={<span className="text-[13px] text-ink-3">Employers, titles and dates come straight from your profile</span>}>
              <span id="cv">Tailored resume</span>
            </SectionTitle>
            <TextEditor kind="resume" appId={app.id} initial={app.resume_text ?? ""} rows={22} extra={<DownloadLinks appId={app.id} doc="resume" />} />
          </section>

          <section aria-labelledby="cl">
            <SectionTitle>
              <span id="cl">Cover letter</span>
            </SectionTitle>
            <TextEditor kind="cover" appId={app.id} initial={coverText} rows={14} extra={<DownloadLinks appId={app.id} doc="cover" />} />
          </section>

          <section aria-labelledby="qa">
            <SectionTitle aside={needsInput ? <span className="text-[13.5px] font-medium text-possible">{needsInput} to check</span> : null}>
              <span id="qa">Likely application questions</span>
            </SectionTitle>
            <div className="flex flex-col gap-5">
              {answers.map((a) => (
                <div key={a.id}>
                  <p className="mb-2 font-semibold">{a.question}</p>
                  <TextEditor kind="answer" appId={app.id} answerId={a.id} initial={a.answer} rows={4} />
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="eq">
            <SectionTitle aside={features.employerQuestions ? <Tag tone="tape">Pro</Tag> : null}>
              <span id="eq">Questions from the employer's form</span>
            </SectionTitle>
            {features.employerQuestions ? (
              <>
                <p className="mb-3 max-w-[65ch] text-[14.5px] text-ink-2">
                  Open the application page, copy the questions it asks, and paste them here. We'll write a full answer to each, based on your profile and this listing, and add them to the list above.
                </p>
                <EmployerQuestionsForm appId={app.id} />
              </>
            ) : (
              <ProUpsell>Answer the employer's own questions</ProUpsell>
            )}
          </section>

          {missing.length ? (
            <section aria-labelledby="mi">
              <SectionTitle>
                <span id="mi">{missing.some((m) => m.why.startsWith("Assumed:")) ? "Check these before you send" : "Information that would strengthen this application"}</span>
              </SectionTitle>
              <ul className="space-y-2">
                {missing.map((m, i) => (
                  <li key={i}>
                    <p className="font-medium">{m.question}</p>
                    <p className="text-[14px] text-ink-2">{m.why}</p>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[14px]">
                Add it to your <Link href="/profile" className="underline underline-offset-2">career profile</Link>, then prepare the application again.
              </p>
            </section>
          ) : null}

          <div>
            <GenerateForm jobId={id} label="Prepare again from my current profile" />
            <p className="mt-2 text-[13px] text-ink-3">This replaces the drafts above and uses one tailored application from your allowance.</p>
          </div>
        </div>

        <aside className="flex flex-col gap-6 lg:sticky lg:top-6 lg:self-start">
          {match ? (
            <Panel className="p-5">
              <div className="flex items-baseline justify-between">
                <span className="text-[26px] font-bold num">{match.score}</span>
                <span className="text-[13.5px] font-semibold text-ink-2">{(match.breakdown as { label?: string })?.label}</span>
              </div>
              <FitTape score={match.score} blocked={!!match.disqualifiers?.length} className="mt-2" />
            </Panel>
          ) : null}
          <Panel className="p-5">
            <h2 className="text-[16px] font-bold">Final check</h2>
            <p className="mt-1 text-[13.5px] text-ink-2">You're responsible for what you send. Tick each item once you've checked it.</p>
            <form action={saveChecklist} className="mt-4 flex flex-col gap-2.5">
              <input type="hidden" name="appId" value={app.id} />
              {checklist.map((c) => (
                <label key={c.id} className="flex items-start gap-2 text-[14px]">
                  <input type="checkbox" name="check" value={c.id} defaultChecked={c.checked} className="mt-1 size-4 shrink-0 accent-[var(--ink)]" />
                  <span>{c.label}</span>
                </label>
              ))}
              <SubmitButton variant="secondary" className="mt-2" pending="Saving…">Save checklist</SubmitButton>
            </form>
          </Panel>
          <Panel className="p-5">
            <h2 className="text-[16px] font-bold">Apply</h2>
            <p className="mt-1 text-[13.5px] text-ink-2">
              {reviewed ? "Everything's checked. Apply on the official page, then come back and mark it as applied." : "Finish the checklist first. We never submit applications for you."}
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {job.apply_url ? (
                <ExternalButton href={job.apply_url} variant={reviewed ? "apply" : "secondary"}>{applyLabel}</ExternalButton>
              ) : (
                <Notice tone="warn">This listing has no application link.</Notice>
              )}
              <form action={markApplied}>
                <input type="hidden" name="appId" value={app.id} />
                <SubmitButton variant="ghost" className="w-full" pending="Saving…">
                  {application?.status === "applied" ? "Marked as applied" : "I've applied"}
                </SubmitButton>
              </form>
              <CopyButton text={app.resume_text ?? ""} label="Copy resume text" />
            </div>
          </Panel>
        </aside>
      </div>
    </>
  );
}
