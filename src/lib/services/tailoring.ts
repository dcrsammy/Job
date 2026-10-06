// Generates and stores the tailored application package for one job.
import type { SupabaseClient } from "@supabase/supabase-js";
import { analyzeJobWithAI } from "../ai/job-analysis";
import { AIError, getAIProvider } from "../ai/provider";
import { buildAiPackage, buildTemplatePackage, type ApplicationPackage } from "../tailoring/generate";
import type { JobRequirement } from "../types";
import { loadCandidate, toTailorCandidate } from "./candidate";
import { scoreSingleJob, matchToRow } from "./matching";
import { assertAllowance, audit, recordAIUsage, recordTemplateUsage } from "./usage";

export async function refineJobRequirements(db: SupabaseClient, userId: string, jobId: string): Promise<boolean> {
  const provider = getAIProvider();
  if (!provider) return false;
  const { data: job } = await db.from("jobs").select("id, title, employer_name, description_text, requirements_extracted_by").eq("id", jobId).single();
  if (!job || job.requirements_extracted_by === "ai" || (job.description_text ?? "").length < 200) return false;
  try {
    const { requirements, usage } = await analyzeJobWithAI(provider, job.title, job.employer_name, job.description_text);
    await recordAIUsage(db, userId, "job_analysis", usage);
    if (requirements.length === 0) return false;
    await db.from("job_requirements").delete().eq("job_id", jobId);
    await db.from("job_requirements").insert(
      requirements.map((r) => ({ job_id: jobId, kind: r.kind, text: r.text.slice(0, 1000), normalized: r.normalized ?? null, importance: r.importance, min_years: r.minYears ?? null, extracted_by: "ai" })),
    );
    await db.from("jobs").update({ requirements_extracted_by: "ai" }).eq("id", jobId);
    return true;
  } catch (err) {
    if (err instanceof AIError && err.usage) await recordAIUsage(db, userId, "job_analysis", err.usage, false);
    return false;
  }
}

export async function generateApplication(db: SupabaseClient, userId: string, jobId: string): Promise<{ id: string; pkg: ApplicationPackage }> {
  const { useCredit } = await assertAllowance(db, userId, "tailor");

  const full = await loadCandidate(db, userId);
  if (!full) throw new Error("Upload your resume first.");
  if (full.experiences.length === 0 && full.skills.length === 0) throw new Error("Your profile is empty. Upload a resume or add your experience first.");

  await refineJobRequirements(db, userId, jobId);

  const { data: job } = await db
    .from("jobs")
    .select("id, title, employer_name, description_text, remote_type, location_raw, job_requirements(kind, text, normalized, importance, min_years)")
    .eq("id", jobId)
    .single();
  if (!job) throw new Error("Job not found.");

  const match = await scoreSingleJob(db, userId, jobId);
  if (match) await db.from("job_matches").upsert(matchToRow(userId, jobId, match), { onConflict: "user_id,job_id" });

  const tailorJob = {
    title: job.title,
    employerName: job.employer_name,
    descriptionText: job.description_text,
    remoteType: job.remote_type,
    locationRaw: job.location_raw,
    requirements: (job.job_requirements as { kind: JobRequirement["kind"]; text: string; normalized: string | null; importance: "required" | "preferred"; min_years: number | null }[]).map(
      (r) => ({ kind: r.kind, text: r.text, normalized: r.normalized, importance: r.importance, minYears: r.min_years }),
    ),
  };
  const candidate = toTailorCandidate(full);

  const provider = getAIProvider();
  let pkg: ApplicationPackage;
  if (provider) {
    try {
      pkg = await buildAiPackage(provider, candidate, tailorJob, match);
      if (pkg.usage) await recordAIUsage(db, userId, "tailor", pkg.usage, true, useCredit);
    } catch (err) {
      if (err instanceof AIError && err.usage) await recordAIUsage(db, userId, "tailor", err.usage, false);
      pkg = buildTemplatePackage(candidate, tailorJob, match);
      pkg.recommendations.unshift("AI drafting was unavailable, so this is a template. Fill in the [placeholders].");
      await recordTemplateUsage(db, userId, "tailor");
    }
  } else {
    pkg = buildTemplatePackage(candidate, tailorJob, match);
    await recordTemplateUsage(db, userId, "tailor");
  }

  const { data: saved, error } = await db
    .from("tailored_applications")
    .upsert(
      {
        user_id: userId,
        job_id: jobId,
        status: "draft",
        evidence_map: pkg.evidenceMap,
        recommendations: pkg.recommendations,
        resume_content: pkg.resume,
        resume_text: pkg.resumeText,
        missing_info: pkg.missingInfo,
        checklist: pkg.checklist.map((c) => ({ ...c, checked: !!c.autoChecked })),
        fabrication_warnings: pkg.warnings,
        model: pkg.usage?.model ?? pkg.generator,
        reviewed_at: null,
      },
      { onConflict: "user_id,job_id" },
    )
    .select("id")
    .single();
  if (error || !saved) throw new Error(`Could not save application: ${error?.message}`);

  await db.from("cover_letters").upsert({ user_id: userId, tailored_application_id: saved.id, content: pkg.coverLetter, edited_by_user: false }, { onConflict: "tailored_application_id" });
  await db.from("application_answers").delete().eq("tailored_application_id", saved.id);
  if (pkg.answers.length) {
    await db.from("application_answers").insert(
      pkg.answers.map((a, i) => ({ user_id: userId, tailored_application_id: saved.id, question: a.question, answer: a.answer, needs_user_input: a.needsUserInput, sort_order: i })),
    );
  }
  await db.from("resume_versions").insert({ user_id: userId, job_id: jobId, kind: "tailored", content: pkg.resume, content_text: pkg.resumeText });

  const { data: app } = await db.from("applications").select("id, status").eq("user_id", userId).eq("job_id", jobId).maybeSingle();
  if (!app) await db.from("applications").insert({ user_id: userId, job_id: jobId, status: "preparing", tailored_application_id: saved.id });
  else if (["saved", "interested"].includes(app.status)) await db.from("applications").update({ status: "preparing", tailored_application_id: saved.id }).eq("id", app.id);
  else await db.from("applications").update({ tailored_application_id: saved.id }).eq("id", app.id);

  await audit(db, userId, "application.generated", { entity: "tailored_application", entityId: saved.id, metadata: { job_id: jobId, generator: pkg.generator, warnings: pkg.warnings.length } });
  return { id: saved.id, pkg };
}
