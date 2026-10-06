import type { Metadata } from "next";
import Link from "next/link";
import { removeResume } from "@/app/actions/resume";
import { ResumeUpload } from "@/components/resume-upload";
import { SubmitButton } from "@/components/submit-button";
import { Notice, PageHeader, Panel, SectionTitle, Tag } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { shortDate } from "@/lib/format";
import { getAllowance } from "@/lib/services/usage";
import { planName } from "@/lib/config";
import { DownloadResume } from "@/components/download-resume";

export const metadata: Metadata = { title: "My resume" };

export default async function ResumePage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { supabase, user } = await requireUser();
  const sp = await searchParams;
  const [{ data: resumes }, allowance] = await Promise.all([
    supabase.from("resumes").select("id, file_name, size_bytes, status, parse_error, created_at, is_primary, delete_after").eq("user_id", user.id).order("created_at", { ascending: false }),
    getAllowance(supabase, user.id, "resume_parse").catch(() => null),
  ]);
  const current = resumes?.find((r) => r.is_primary);

  return (
    <>
      <PageHeader
        title="My resume"
        description="We read your resume to build your career profile. Nothing is invented: every item shows where it came from, and you can edit or delete anything."
      />
      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-6">
          {sp.plan === "requested" ? (
            <Notice tone="info">
              Welcome! You're on Basic for now. We'll switch you to the plan you chose as soon as it's activated. <Link href="/settings#plan" className="underline underline-offset-2">See your plan</Link>
            </Notice>
          ) : null}
          {current?.status === "failed" ? <Notice tone="error">We couldn't read your last upload: {current.parse_error}</Notice> : null}
          <ResumeUpload replacing={!!current} />
          {current ? (
            <p className="text-[14px] text-ink-2">
              Uploading a new resume replaces the items we extracted before. Anything you added or edited yourself is kept.
            </p>
          ) : null}
          {allowance ? (
            <p className="text-[13.5px] text-ink-3 num">
              {Math.max(0, allowance.limit - allowance.used)} of {allowance.limit} resume analyses left this month on the {planName(allowance.plan)} plan
              {allowance.credits ? `, plus ${allowance.credits} credits` : ""}.
            </p>
          ) : null}
        </div>
        <aside>
          <SectionTitle>Uploaded files</SectionTitle>
          {resumes?.length ? (
            <Panel as="div" className="divide-y divide-line">
              {resumes.map((r) => (
                <div key={r.id} className="flex flex-col gap-2 px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate font-medium" title={r.file_name}>{r.file_name}</p>
                    {r.is_primary ? <Tag tone="strong">In use</Tag> : null}
                  </div>
                  <p className="text-[13px] text-ink-3">
                    Uploaded {shortDate(r.created_at)}
                    {r.delete_after ? `. Deleted automatically ${shortDate(r.delete_after)}` : ""}
                    {r.status !== "parsed" ? `. ${r.status === "failed" ? "Couldn't be read" : "Processing"}` : ""}
                  </p>
                  <div className="flex gap-3 text-[13.5px]">
                    <DownloadResume resumeId={r.id} />
                    <form action={removeResume}>
                      <input type="hidden" name="resumeId" value={r.id} />
                      <SubmitButton variant="ghost" className="h-auto px-0 text-[13.5px] text-block hover:bg-transparent" confirm="Delete this file permanently?" pending="Deleting…">
                        Delete file
                      </SubmitButton>
                    </form>
                  </div>
                </div>
              ))}
            </Panel>
          ) : (
            <p className="text-ink-2">No files yet.</p>
          )}
          <p className="mt-4 text-[13.5px] text-ink-3">
            Files are stored privately and only you can open them. Set automatic deletion in{" "}
            <Link href="/settings" className="underline underline-offset-2">Settings & privacy</Link>.
          </p>
        </aside>
      </div>
    </>
  );
}
