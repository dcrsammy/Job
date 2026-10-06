// Data export, account deletion and retention purge.
import type { SupabaseClient } from "@supabase/supabase-js";
import { audit } from "./usage";

const USER_TABLES = [
  "candidate_profiles",
  "candidate_skills",
  "experiences",
  "educations",
  "resumes",
  "resume_versions",
  "job_matches",
  "tailored_applications",
  "cover_letters",
  "application_answers",
  "saved_jobs",
  "applications",
  "subscriptions",
  "ai_usage",
  "audit_logs",
] as const;

export async function exportUserData(db: SupabaseClient, userId: string): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { exported_at: new Date().toISOString() };
  const { data: profile } = await db.from("profiles").select("id, email, full_name, resume_retention_days, created_at").eq("id", userId).single();
  out.account = profile;
  for (const t of USER_TABLES) {
    const { data } = await db.from(t).select("*").eq("user_id", userId);
    out[t] = t === "resumes" ? (data ?? []).map(({ raw_text: _omit, ...r }) => ({ ...r, raw_text_included: false })) : data ?? [];
  }
  await audit(db, userId, "data.exported");
  return out;
}

async function removeUserFiles(db: SupabaseClient, userId: string) {
  for (const bucket of ["resumes", "documents"]) {
    const { data: files } = await db.storage.from(bucket).list(userId, { limit: 1000 });
    if (files?.length) await db.storage.from(bucket).remove(files.map((f) => `${userId}/${f.name}`));
  }
}

/** Delete all resume files and parsed profile data but keep the account. */
export async function deleteResumeData(db: SupabaseClient, userId: string) {
  await removeUserFiles(db, userId);
  await db.from("resumes").delete().eq("user_id", userId);
  await db.from("candidate_skills").delete().eq("user_id", userId);
  await db.from("experiences").delete().eq("user_id", userId);
  await db.from("educations").delete().eq("user_id", userId);
  await db.from("resume_versions").delete().eq("user_id", userId);
  await db.from("job_matches").delete().eq("user_id", userId);
  await db
    .from("candidate_profiles")
    .update({ headline: null, summary: null, years_experience: null, seniority: "unknown", role_families: [], industries: [], contact: {}, confirmed_at: null, source_resume_id: null, embedding: null })
    .eq("user_id", userId);
  await audit(db, userId, "data.resume_data_deleted");
}

/** Permanently delete the account and everything linked to it. */
export async function deleteAccount(db: SupabaseClient, userId: string) {
  await removeUserFiles(db, userId);
  // profiles → cascade removes every user-owned row.
  const { error } = await db.auth.admin.deleteUser(userId);
  if (error) throw new Error(`Could not delete account: ${error.message}`);
  await audit(db, null, "account.deleted", { actor: "system", metadata: { user: "redacted" } });
}

/** Delete resumes past their retention date (run by the worker). */
export async function purgeExpiredResumes(db: SupabaseClient): Promise<number> {
  const { data } = await db.rpc("expired_resumes", { p_limit: 200 });
  const rows = (data ?? []) as { id: string; user_id: string; storage_path: string }[];
  if (rows.length === 0) return 0;
  await db.storage.from("resumes").remove(rows.map((r) => r.storage_path));
  await db.from("resumes").delete().in("id", rows.map((r) => r.id));
  for (const r of rows) await audit(db, r.user_id, "resume.retention_purged", { actor: "system", entity: "resume", entityId: r.id });
  return rows.length;
}
