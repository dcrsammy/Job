"use server";
// Admin console actions. Every action re-checks that the caller is an admin,
// uses the service-role client, and writes an audit log entry.
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { PLAN_TIERS, planInfo, type PlanTier } from "@/lib/config";
import { publicEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { ingestSource, type SourceRow } from "@/lib/services/ingest";
import { runMatchingForUser } from "@/lib/services/matching";
import { deleteAccount, deleteResumeData, purgeExpiredResumes } from "@/lib/services/privacy";
import { enqueueMatchingForActiveUsers, followUpApplications, processTasks } from "@/lib/services/worker";
import { audit } from "@/lib/services/usage";

export type AdminState = { error?: string; ok?: string; link?: string } | undefined;

const uuid = z.string().uuid();

async function admin() {
  const { user } = await requireAdmin();
  return { me: user, db: createAdminClient() };
}

function done(paths: string[], ok: string, link?: string): AdminState {
  for (const p of paths) revalidatePath(p);
  return { ok, link };
}

function fail(err: unknown): AdminState {
  console.error("[admin]", err);
  return { error: (err as Error)?.message?.slice(0, 300) || "Something went wrong." };
}

async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : publicEnv().siteUrl;
}

const userPaths = (id: string) => ["/admin", "/admin/users", `/admin/users/${id}`];

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------
export async function adminSetPlan(_: AdminState, form: FormData): Promise<AdminState> {
  try {
    const { me, db } = await admin();
    const userId = uuid.parse(form.get("userId"));
    const plan = z.enum(PLAN_TIERS as [PlanTier, ...PlanTier[]]).parse(form.get("plan"));
    const days = Number(form.get("days") || 0);
    const end = plan !== "free" && days > 0 ? new Date(Date.now() + days * 86_400_000).toISOString() : null;
    const { error } = await db
      .from("subscriptions")
      .update({ plan, status: "active", current_period_end: end, requested_plan: null, requested_at: null, granted_by: me.id, provider: plan === "free" ? null : "manual" })
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    await audit(db, userId, "plan.changed", { actor: "admin", metadata: { plan, days: days || null, by: me.email } });
    // Match list size depends on the plan.
    await db.rpc("enqueue_task", { p_kind: "match_user", p_payload: { user_id: userId }, p_dedupe_key: `match:${userId}` });
    return done(userPaths(userId), `Now on ${planInfo[plan].name}${end ? ` until ${end.slice(0, 10)}` : ""}.`);
  } catch (e) {
    return fail(e);
  }
}

export async function adminDeclineRequest(_: AdminState, form: FormData): Promise<AdminState> {
  try {
    const { me, db } = await admin();
    const userId = uuid.parse(form.get("userId"));
    await db.from("subscriptions").update({ requested_plan: null, requested_at: null }).eq("user_id", userId);
    await audit(db, userId, "plan.request_declined", { actor: "admin", metadata: { by: me.email } });
    return done(userPaths(userId), "Request declined. They stay on their current plan.");
  } catch (e) {
    return fail(e);
  }
}

export async function adminSetCredits(_: AdminState, form: FormData): Promise<AdminState> {
  try {
    const { me, db } = await admin();
    const userId = uuid.parse(form.get("userId"));
    const credits = z.coerce.number().int().min(0).max(100000).parse(form.get("credits"));
    await db.from("subscriptions").update({ credits }).eq("user_id", userId);
    await audit(db, userId, "plan.credits_set", { actor: "admin", metadata: { credits, by: me.email } });
    return done(userPaths(userId), `Credits set to ${credits}.`);
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------
export async function adminSetRole(_: AdminState, form: FormData): Promise<AdminState> {
  try {
    const { me, db } = await admin();
    const userId = uuid.parse(form.get("userId"));
    const role = z.enum(["user", "admin"]).parse(form.get("role"));
    if (userId === me.id && role !== "admin") return { error: "You can't remove your own admin access." };
    await db.from("profiles").update({ role }).eq("id", userId);
    await audit(db, userId, "admin.role_changed", { actor: "admin", metadata: { role, by: me.email } });
    return done(userPaths(userId), role === "admin" ? "Now an admin." : "Admin access removed.");
  } catch (e) {
    return fail(e);
  }
}

export async function adminResetLink(_: AdminState, form: FormData): Promise<AdminState> {
  try {
    const { me, db } = await admin();
    const userId = uuid.parse(form.get("userId"));
    const { data: u, error: uErr } = await db.auth.admin.getUserById(userId);
    if (uErr || !u.user?.email) throw new Error(uErr?.message ?? "User has no email.");
    const { data, error } = await db.auth.admin.generateLink({ type: "recovery", email: u.user.email });
    if (error) throw new Error(error.message);
    // Our own confirm route verifies the token, so the link works whatever Supabase's Site URL is set to.
    const link = `${await origin()}/auth/confirm?token_hash=${data.properties.hashed_token}&type=recovery&next=/reset-password`;
    await audit(db, userId, "admin.reset_link", { actor: "admin", metadata: { by: me.email } });
    return { ok: "Send this link to the user. It works once and expires in about an hour.", link };
  } catch (e) {
    return fail(e);
  }
}

export async function adminConfirmEmail(_: AdminState, form: FormData): Promise<AdminState> {
  try {
    const { me, db } = await admin();
    const userId = uuid.parse(form.get("userId"));
    const { error } = await db.auth.admin.updateUserById(userId, { email_confirm: true });
    if (error) throw new Error(error.message);
    await audit(db, userId, "admin.email_confirmed", { actor: "admin", metadata: { by: me.email } });
    return done(userPaths(userId), "Email marked as confirmed. They can sign in now.");
  } catch (e) {
    return fail(e);
  }
}

export async function adminSetBanned(_: AdminState, form: FormData): Promise<AdminState> {
  try {
    const { me, db } = await admin();
    const userId = uuid.parse(form.get("userId"));
    const banned = form.get("banned") === "true";
    if (userId === me.id) return { error: "You can't suspend yourself." };
    const { error } = await db.auth.admin.updateUserById(userId, { ban_duration: banned ? "876000h" : "none" });
    if (error) throw new Error(error.message);
    await audit(db, userId, banned ? "admin.suspended" : "admin.unsuspended", { actor: "admin", metadata: { by: me.email } });
    return done(userPaths(userId), banned ? "Suspended. They can't sign in." : "Suspension lifted.");
  } catch (e) {
    return fail(e);
  }
}

export async function adminRematchUser(_: AdminState, form: FormData): Promise<AdminState> {
  try {
    const { me, db } = await admin();
    const userId = uuid.parse(form.get("userId"));
    const r = await runMatchingForUser(db, userId);
    await audit(db, userId, "admin.rematched", { actor: "admin", metadata: { ...r, by: me.email } });
    return done(userPaths(userId), r.scored ? `Scored ${r.scored} jobs, kept the top ${r.kept}.` : "Nothing to match: this user has no profile yet.");
  } catch (e) {
    return fail(e);
  }
}

export async function adminWipeResume(_: AdminState, form: FormData): Promise<AdminState> {
  try {
    const { me, db } = await admin();
    const userId = uuid.parse(form.get("userId"));
    await deleteResumeData(db, userId);
    await audit(db, userId, "admin.resume_wiped", { actor: "admin", metadata: { by: me.email } });
    return done(userPaths(userId), "Resume files and profile data deleted. They can upload again.");
  } catch (e) {
    return fail(e);
  }
}

export async function adminDeleteUser(_: AdminState, form: FormData): Promise<AdminState> {
  try {
    const { me, db } = await admin();
    const userId = uuid.parse(form.get("userId"));
    if (userId === me.id) return { error: "You can't delete your own account from here." };
    const { data: p } = await db.from("profiles").select("email").eq("id", userId).single();
    if (String(form.get("confirm") ?? "").trim().toLowerCase() !== (p?.email ?? "").toLowerCase()) return { error: "Type the user's email exactly to confirm." };
    await audit(db, null, "admin.user_deleted", { actor: "admin", metadata: { user_id: userId, email: p?.email, by: me.email } });
    await deleteAccount(db, userId);
    revalidatePath("/admin/users");
    return { ok: "Account deleted." };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------
// Applications & jobs
// ---------------------------------------------------------------------------
const AppStatus = z.enum(["saved", "interested", "preparing", "applied", "interview", "offer", "rejected", "withdrawn", "no_response", "closed"]);

export async function adminSetApplicationStatus(_: AdminState, form: FormData): Promise<AdminState> {
  try {
    const { me, db } = await admin();
    const id = uuid.parse(form.get("id"));
    const status = AppStatus.parse(form.get("status"));
    const { data: app, error } = await db
      .from("applications")
      .update({ status, auto_closed_at: null, auto_closed_reason: null, ...(status === "applied" ? { applied_at: new Date().toISOString() } : {}) })
      .eq("id", id)
      .select("user_id, job_id")
      .single();
    if (error || !app) throw new Error(error?.message ?? "Not found");
    await audit(db, app.user_id, "application.status", { actor: "admin", entity: "job", entityId: app.job_id, metadata: { status, by: me.email } });
    return done(["/admin/applications", `/admin/users/${app.user_id}`], "Status updated.");
  } catch (e) {
    return fail(e);
  }
}

export async function adminSetJob(_: AdminState, form: FormData): Promise<AdminState> {
  try {
    const { me, db } = await admin();
    const id = uuid.parse(form.get("id"));
    const patch: Record<string, unknown> = {};
    if (form.has("active")) patch.is_active = form.get("active") === "true";
    if (form.has("verification")) patch.verification_status = z.enum(["official", "third_party", "flagged"]).parse(form.get("verification"));
    if (!Object.keys(patch).length) return { error: "Nothing to change." };
    const { error } = await db.from("jobs").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    if (patch.is_active === false || patch.verification_status === "flagged") await db.from("job_matches").delete().eq("job_id", id);
    await audit(db, null, "admin.job_updated", { actor: "admin", entity: "job", entityId: id, metadata: { ...patch, by: me.email } });
    return done(["/admin/jobs"], patch.is_active === false ? "Job hidden from everyone." : patch.is_active === true ? "Job is live again." : "Updated.");
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------
export async function toggleSource(form: FormData) {
  const { me, db } = await admin();
  const id = uuid.parse(form.get("id"));
  const enabled = form.get("enabled") === "true";
  await db.from("job_sources").update({ enabled, consecutive_failures: 0 }).eq("id", id);
  await audit(db, me.id, "admin.source_toggled", { actor: "admin", entity: "job_source", entityId: id, metadata: { enabled } });
  revalidatePath("/admin/jobs");
}

export async function runSourceNow(_: AdminState, form: FormData): Promise<AdminState> {
  try {
    const { me, db } = await admin();
    const id = uuid.parse(form.get("id"));
    const { data: source } = await db.from("job_sources").select("*").eq("id", id).single();
    if (!source) return { error: "Source not found" };
    const r = await ingestSource(db, source as SourceRow);
    await audit(db, me.id, "admin.source_run", { actor: "admin", entity: "job_source", entityId: id, metadata: { status: r.status } });
    if (r.status !== "failed") await enqueueMatchingForActiveUsers(db);
    revalidatePath("/admin/jobs");
    return r.status === "failed" ? { error: r.errors[0] } : { ok: `${r.fetched} fetched, ${r.inserted} new, ${r.updated} updated, ${r.deactivated} closed` };
  } catch (e) {
    return fail(e);
  }
}

const NewSource = z.object({
  kind: z.enum(["greenhouse", "lever", "ashby", "remotive", "arbeitnow", "remoteok", "adzuna", "jsonld"]),
  name: z.string().trim().min(2).max(80),
  key: z.string().trim().max(2000),
  official: z.boolean(),
  interval: z.coerce.number().int().min(60).max(10080),
});

export async function addSource(_: AdminState, form: FormData): Promise<AdminState> {
  const { me, db } = await admin();
  const p = NewSource.safeParse({
    kind: form.get("kind"),
    name: form.get("name"),
    key: form.get("key") ?? "",
    official: form.get("official") === "on",
    interval: form.get("interval") ?? 360,
  });
  if (!p.success) return { error: p.error.issues[0].message };
  const { kind, name, key, official, interval } = p.data;
  let config: Record<string, unknown> = {};
  if (kind === "greenhouse" || kind === "ashby") config = { board: key };
  else if (kind === "lever") config = { company: key };
  else if (kind === "jsonld") config = { urls: key.split(/\s+/).filter((u) => u.startsWith("https://")), employer: name };
  else if (kind === "adzuna") config = { country: key || "gb", what: "remote" };
  if ((kind === "greenhouse" || kind === "ashby" || kind === "lever") && !/^[A-Za-z0-9_.-]+$/.test(key)) return { error: "Enter the board name exactly as it appears in the job board URL." };
  const slug = `${kind.slice(0, 2)}-${(key || name).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`;
  const { error } = await db.from("job_sources").insert({ kind, name, slug, config, is_official: official, min_interval_minutes: interval, enabled: true });
  if (error) return { error: error.code === "23505" ? "That source already exists." : error.message };
  await audit(db, me.id, "admin.source_added", { actor: "admin", metadata: { kind, slug } });
  revalidatePath("/admin/jobs");
  return { ok: `Added ${name}. Run it now to fetch jobs.` };
}

// ---------------------------------------------------------------------------
// Background work
// ---------------------------------------------------------------------------
export async function adminRunQueue(_: AdminState, _form: FormData): Promise<AdminState> {
  try {
    const { db } = await admin();
    const r = await processTasks(db, 3);
    return done(["/admin", "/admin/system"], r.length ? r.map((t) => `${t.kind}: ${t.ok ? "ok" : "failed"}${t.detail ? ` (${t.detail})` : ""}`).join("; ") : "Nothing was waiting.");
  } catch (e) {
    return fail(e);
  }
}

export async function adminTask(_: AdminState, form: FormData): Promise<AdminState> {
  try {
    const { me, db } = await admin();
    const op = z.enum(["retry", "delete", "retry_failed", "clear_finished", "housekeeping", "rematch_all"]).parse(form.get("op"));
    let msg = "";
    if (op === "retry" || op === "delete") {
      const id = uuid.parse(form.get("id"));
      if (op === "retry") await db.from("task_queue").update({ status: "queued", attempts: 0, last_error: null, run_after: new Date().toISOString(), locked_at: null }).eq("id", id);
      else await db.from("task_queue").delete().eq("id", id);
      msg = op === "retry" ? "Queued again." : "Deleted.";
    } else if (op === "retry_failed") {
      const { data } = await db.from("task_queue").update({ status: "queued", attempts: 0, last_error: null, run_after: new Date().toISOString(), locked_at: null }).eq("status", "failed").select("id");
      msg = `${data?.length ?? 0} failed tasks queued again.`;
    } else if (op === "clear_finished") {
      const { data } = await db.from("task_queue").delete().eq("status", "done").lt("created_at", new Date(Date.now() - 86_400_000).toISOString()).select("id");
      msg = `Cleared ${data?.length ?? 0} finished tasks.`;
    } else if (op === "housekeeping") {
      const f = await followUpApplications(db);
      const purged = await purgeExpiredResumes(db);
      msg = `Moved ${f.noResponse} to No response, ${f.closed} to Listing closed, purged ${purged} expired resumes.`;
    } else if (op === "rematch_all") {
      await enqueueMatchingForActiveUsers(db);
      msg = "Matching queued for every user with a confirmed profile. The worker runs it within 30 minutes, or press Process queue now.";
    }
    await audit(db, me.id, `admin.task_${op}`, { actor: "admin" });
    return done(["/admin", "/admin/system"], msg);
  } catch (e) {
    return fail(e);
  }
}
