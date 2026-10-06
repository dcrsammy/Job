// Premium features: interview prep and follow-up emails.
import type { SupabaseClient } from "@supabase/supabase-js";
import { AIError, getAIProvider } from "../ai/provider";
import { planFeatures } from "../config";
import { buildFollowUpEmail, buildInterviewPrep, type FollowUpEmail, type InterviewPrep } from "../tailoring/premium";
import type { TailorJob } from "../tailoring/generate";
import type { JobRequirement } from "../types";
import { loadCandidate, toTailorCandidate } from "./candidate";
import { scoreSingleJob } from "./matching";
import { assertAllowance, audit, getPlan, recordAIUsage, UsageLimitError } from "./usage";

type Kind = "interview_prep" | "follow_up";

async function requirePremium(db: SupabaseClient, userId: string, kind: Kind) {
  const plan = await getPlan(db, userId);
  const ok = kind === "interview_prep" ? planFeatures[plan].interviewPrep : planFeatures[plan].followUps;
  if (!ok) throw new UsageLimitError("This is a Premium feature. Upgrade to Premium in Settings to use it.");
  return assertAllowance(db, userId, kind);
}

async function loadInputs(db: SupabaseClient, userId: string, jobId: string) {
  const full = await loadCandidate(db, userId);
  if (!full || (full.experiences.length === 0 && full.skills.length === 0)) throw new UsageLimitError("Upload your resume first.");
  const { data: job } = await db
    .from("jobs")
    .select("id, title, employer_name, description_text, remote_type, location_raw, job_requirements(kind, text, normalized, importance, min_years)")
    .eq("id", jobId)
    .single();
  if (!job) throw new UsageLimitError("Job not found.");
  const tailorJob: TailorJob = {
    title: job.title,
    employerName: job.employer_name,
    descriptionText: job.description_text ?? "",
    remoteType: job.remote_type,
    locationRaw: job.location_raw,
    requirements: ((job.job_requirements ?? []) as { kind: JobRequirement["kind"]; text: string; normalized: string | null; importance: "required" | "preferred"; min_years: number | null }[]).map(
      (r) => ({ kind: r.kind, text: r.text, normalized: r.normalized, importance: r.importance, minYears: r.min_years }),
    ),
  };
  return { candidate: toTailorCandidate(full), job: tailorJob };
}

async function save(db: SupabaseClient, userId: string, jobId: string, kind: Kind, content: unknown, warnings: unknown[], model: string) {
  const { error } = await db
    .from("application_extras")
    .upsert({ user_id: userId, job_id: jobId, kind, content, warnings, model }, { onConflict: "user_id,job_id,kind" });
  if (error) throw new Error(`Could not save: ${error.message}`);
}

async function failed(db: SupabaseClient, userId: string, kind: Kind, err: unknown): Promise<never> {
  console.error(`[premium] ${kind} failed`, err);
  if (err instanceof AIError && err.usage) await recordAIUsage(db, userId, kind, err.usage, false);
  await audit(db, userId, "ai.error", { actor: "system", metadata: { feature: kind, message: String((err as Error).message).slice(0, 500) } });
  throw new UsageLimitError("We couldn't write that just now. Please try again in a minute.");
}

export async function generateInterviewPrep(db: SupabaseClient, userId: string, jobId: string): Promise<InterviewPrep> {
  const { useCredit } = await requirePremium(db, userId, "interview_prep");
  const provider = getAIProvider();
  if (!provider) throw new UsageLimitError("AI features aren't available right now.");
  const { candidate, job } = await loadInputs(db, userId, jobId);
  const match = await scoreSingleJob(db, userId, jobId);
  let result;
  try {
    result = await buildInterviewPrep(provider, candidate, job, match);
  } catch (err) {
    return failed(db, userId, "interview_prep", err);
  }
  await recordAIUsage(db, userId, "interview_prep", result.usage, true, useCredit);
  await save(db, userId, jobId, "interview_prep", result.prep, result.warnings, result.usage.model);
  await audit(db, userId, "premium.interview_prep", { entity: "job", entityId: jobId, metadata: { questions: result.prep.questions.length, warnings: result.warnings.length } });
  return result.prep;
}

export async function generateFollowUp(db: SupabaseClient, userId: string, jobId: string, contactName?: string | null): Promise<FollowUpEmail> {
  const { useCredit } = await requirePremium(db, userId, "follow_up");
  const provider = getAIProvider();
  if (!provider) throw new UsageLimitError("AI features aren't available right now.");
  const { candidate, job } = await loadInputs(db, userId, jobId);
  const { data: app } = await db.from("applications").select("applied_at").eq("user_id", userId).eq("job_id", jobId).maybeSingle();
  const days = app?.applied_at ? Math.floor((Date.now() - new Date(app.applied_at).getTime()) / 86_400_000) : null;
  let result;
  try {
    result = await buildFollowUpEmail(provider, candidate, job, { daysSinceApplied: days, contactName });
  } catch (err) {
    return failed(db, userId, "follow_up", err);
  }
  await recordAIUsage(db, userId, "follow_up", result.usage, true, useCredit);
  await save(db, userId, jobId, "follow_up", result.email, result.warnings, result.usage.model);
  await audit(db, userId, "premium.follow_up", { entity: "job", entityId: jobId });
  return result.email;
}
