"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { answerEmployerQuestionsForApp, generateApplication } from "@/lib/services/tailoring";
import { audit, UsageLimitError } from "@/lib/services/usage";

export type BuilderState = { error?: string; ok?: string } | undefined;
const uuid = z.string().uuid();

export async function generatePackage(_: BuilderState, form: FormData): Promise<BuilderState> {
  const { user } = await requireUser();
  const jobId = uuid.parse(form.get("jobId"));
  try {
    await generateApplication(createAdminClient(), user.id, jobId);
  } catch (err) {
    if (err instanceof UsageLimitError) return { error: err.message };
    console.error("generate failed", err);
    return { error: (err as Error).message || "Couldn't generate the application. Try again." };
  }
  revalidatePath(`/jobs/${jobId}/apply`);
  revalidatePath("/builder");
  return { ok: "Ready." };
}

async function ownApp(appId: string) {
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("tailored_applications").select("id, job_id, checklist").eq("id", uuid.parse(appId)).eq("user_id", user.id).single();
  if (!data) throw new Error("Not found");
  return { supabase, user, app: data };
}

export async function saveResumeText(_: BuilderState, form: FormData): Promise<BuilderState> {
  const { supabase, app } = await ownApp(String(form.get("appId")));
  const text = String(form.get("text") ?? "").slice(0, 30000);
  await supabase.from("tailored_applications").update({ resume_text: text, status: "draft", reviewed_at: null }).eq("id", app.id);
  revalidatePath(`/jobs/${app.job_id}/apply`);
  return { ok: "Saved." };
}

export async function saveCoverLetter(_: BuilderState, form: FormData): Promise<BuilderState> {
  const { supabase, app } = await ownApp(String(form.get("appId")));
  const text = String(form.get("text") ?? "").slice(0, 10000);
  await supabase.from("cover_letters").update({ content: text, edited_by_user: true }).eq("tailored_application_id", app.id);
  await supabase.from("tailored_applications").update({ status: "draft", reviewed_at: null }).eq("id", app.id);
  revalidatePath(`/jobs/${app.job_id}/apply`);
  return { ok: "Saved." };
}

export async function saveAnswer(_: BuilderState, form: FormData): Promise<BuilderState> {
  const { supabase, user, app } = await ownApp(String(form.get("appId")));
  const answerId = uuid.parse(form.get("answerId"));
  const text = String(form.get("text") ?? "").slice(0, 5000);
  await supabase
    .from("application_answers")
    .update({ answer: text, needs_user_input: /\[[^\]]{2,}\]/.test(text) })
    .eq("id", answerId)
    .eq("user_id", user.id);
  revalidatePath(`/jobs/${app.job_id}/apply`);
  return { ok: "Saved." };
}

export async function saveChecklist(form: FormData) {
  const { supabase, user, app } = await ownApp(String(form.get("appId")));
  const ticked = new Set(form.getAll("check").map(String));
  const checklist = (app.checklist as { id: string; label: string; checked?: boolean }[]).map((c) => ({ ...c, checked: ticked.has(c.id) }));
  const all = checklist.every((c) => c.checked);
  await supabase
    .from("tailored_applications")
    .update({ checklist, status: all ? "reviewed" : "draft", reviewed_at: all ? new Date().toISOString() : null })
    .eq("id", app.id);
  if (all) await audit(createAdminClient(), user.id, "application.reviewed", { entity: "tailored_application", entityId: app.id });
  revalidatePath(`/jobs/${app.job_id}/apply`);
}

export async function markApplied(form: FormData) {
  const { supabase, user, app } = await ownApp(String(form.get("appId")));
  const { data: existing } = await supabase.from("applications").select("id").eq("user_id", user.id).eq("job_id", app.job_id).maybeSingle();
  const patch = { status: "applied", applied_at: new Date().toISOString(), tailored_application_id: app.id };
  if (existing) await supabase.from("applications").update(patch).eq("id", existing.id);
  else await supabase.from("applications").insert({ user_id: user.id, job_id: app.job_id, ...patch });
  await audit(createAdminClient(), user.id, "application.applied", { entity: "job", entityId: app.job_id });
  revalidatePath("/", "layout");
}

export async function answerEmployerQuestionsAction(_: BuilderState, form: FormData): Promise<BuilderState> {
  const { user } = await requireUser();
  const appId = uuid.parse(form.get("appId"));
  const text = String(form.get("questions") ?? "").slice(0, 8000);
  try {
    const n = await answerEmployerQuestionsForApp(createAdminClient(), user.id, appId, text);
    const { data } = await createAdminClient().from("tailored_applications").select("job_id").eq("id", appId).single();
    if (data) revalidatePath(`/jobs/${data.job_id}/apply`);
    return { ok: `Answered ${n} question${n === 1 ? "" : "s"}. They're added to the list above.` };
  } catch (err) {
    if (err instanceof UsageLimitError) return { error: err.message };
    console.error(err);
    return { error: "Couldn't answer those questions. Try again." };
  }
}
