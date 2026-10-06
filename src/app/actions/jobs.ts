"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { runMatchingForUser } from "@/lib/services/matching";
import { audit } from "@/lib/services/usage";

const id = z.string().uuid();

async function upsertInteraction(field: "saved" | "hidden", value: boolean, jobId: string) {
  const { supabase, user } = await requireUser();
  const jid = id.parse(jobId);
  const { data: existing } = await supabase.from("saved_jobs").select("id").eq("user_id", user.id).eq("job_id", jid).maybeSingle();
  if (existing) await supabase.from("saved_jobs").update({ [field]: value }).eq("id", existing.id);
  else await supabase.from("saved_jobs").insert({ user_id: user.id, job_id: jid, [field]: value });
  await audit(createAdminClient(), user.id, `job.${field === "saved" ? (value ? "saved" : "unsaved") : value ? "hidden" : "unhidden"}`, { entity: "job", entityId: jid });
}

export async function saveJob(form: FormData) {
  await upsertInteraction("saved", form.get("value") !== "false", String(form.get("jobId")));
  revalidatePath("/", "layout");
}

export async function hideJob(form: FormData) {
  await upsertInteraction("hidden", form.get("value") !== "false", String(form.get("jobId")));
  revalidatePath("/", "layout");
}

const Status = z.enum(["saved", "interested", "preparing", "applied", "interview", "rejected", "offer", "withdrawn", "no_response", "closed"]);

export async function setApplicationStatus(form: FormData) {
  const { supabase, user } = await requireUser();
  const jobId = id.parse(form.get("jobId"));
  const status = Status.parse(form.get("status"));
  const notes = form.get("notes");
  const { data: existing } = await supabase.from("applications").select("id, applied_at").eq("user_id", user.id).eq("job_id", jobId).maybeSingle();
  // A manual change clears any automatic closing.
  const patch: Record<string, unknown> = { status, auto_closed_at: null, auto_closed_reason: null };
  if (status === "applied" && !existing?.applied_at) patch.applied_at = new Date().toISOString();
  if (typeof notes === "string") patch.notes = notes.slice(0, 4000);
  if (existing) await supabase.from("applications").update(patch).eq("id", existing.id);
  else await supabase.from("applications").insert({ user_id: user.id, job_id: jobId, ...patch });
  await audit(createAdminClient(), user.id, "application.status", { entity: "job", entityId: jobId, metadata: { status } });
  // Once applied (or closed), the job stops appearing in recommendations.
  if (!["saved", "interested", "preparing"].includes(status)) {
    await createAdminClient().from("job_matches").delete().eq("user_id", user.id).eq("job_id", jobId);
  }
  revalidatePath("/", "layout");
}

export async function removeApplication(form: FormData) {
  const { supabase, user } = await requireUser();
  const jobId = id.parse(form.get("jobId"));
  await supabase.from("applications").delete().eq("user_id", user.id).eq("job_id", jobId);
  revalidatePath("/applications");
}

export async function refreshMatches() {
  const { user } = await requireUser();
  await runMatchingForUser(createAdminClient(), user.id);
  revalidatePath("/", "layout");
}
