"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteAccount, deleteResumeData } from "@/lib/services/privacy";
import { audit } from "@/lib/services/usage";

export type SettingsState = { error?: string; ok?: string } | undefined;

export async function setRetention(_: SettingsState, form: FormData): Promise<SettingsState> {
  const { supabase, user } = await requireUser();
  const raw = String(form.get("days") ?? "");
  const days = raw === "" ? null : Number(raw);
  if (days !== null && ![30, 90, 180, 365].includes(days)) return { error: "Choose one of the options." };
  await supabase.from("profiles").update({ resume_retention_days: days }).eq("id", user.id);
  // Apply to files already uploaded.
  const admin = createAdminClient();
  const { data: resumes } = await admin.from("resumes").select("id, created_at").eq("user_id", user.id);
  for (const r of resumes ?? []) {
    const deleteAfter = days ? new Date(new Date(r.created_at).getTime() + days * 86_400_000).toISOString() : null;
    await admin.from("resumes").update({ delete_after: deleteAfter }).eq("id", r.id);
  }
  await audit(admin, user.id, "privacy.retention_changed", { metadata: { days } });
  revalidatePath("/settings");
  return { ok: days ? `Resume files will be deleted ${days} days after upload.` : "Resume files are kept until you delete them." };
}

export async function wipeResumeData() {
  const { user } = await requireUser();
  await deleteResumeData(createAdminClient(), user.id);
  revalidatePath("/", "layout");
  redirect("/settings?wiped=1");
}

export async function removeAccount(_: SettingsState, form: FormData): Promise<SettingsState> {
  const { supabase, user } = await requireUser();
  if (String(form.get("confirm")).trim().toUpperCase() !== "DELETE") return { error: "Type DELETE to confirm." };
  await deleteAccount(createAdminClient(), user.id);
  await supabase.auth.signOut();
  redirect("/?deleted=1");
}

/** Ask for Pro or Premium. Until payments are connected an admin activates it. */
export async function requestPlan(form: FormData) {
  const { user } = await requireUser();
  const plan = String(form.get("plan"));
  const admin = createAdminClient();
  if (plan === "free") {
    await admin.from("subscriptions").update({ plan: "free", requested_plan: null, requested_at: null, current_period_end: null }).eq("user_id", user.id);
    await audit(admin, user.id, "plan.downgraded", { metadata: { plan: "free" } });
  } else if (plan === "pro" || plan === "premium") {
    await admin.from("subscriptions").update({ requested_plan: plan, requested_at: new Date().toISOString() }).eq("user_id", user.id);
    await audit(admin, user.id, "plan.requested", { metadata: { plan } });
  }
  revalidatePath("/settings");
}

export async function cancelPlanRequest() {
  const { user } = await requireUser();
  const admin = createAdminClient();
  await admin.from("subscriptions").update({ requested_plan: null, requested_at: null }).eq("user_id", user.id);
  await audit(admin, user.id, "plan.request_cancelled");
  revalidatePath("/settings");
}
