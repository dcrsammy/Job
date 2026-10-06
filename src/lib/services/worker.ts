// Background worker: schedules due sources and processes the task queue.
// Triggered by /api/cron/tick (GitHub Actions schedule or Cloudflare cron).
import type { SupabaseClient } from "@supabase/supabase-js";
import { ingestSource, isSourceDue, type SourceRow } from "./ingest";
import { runMatchingForUser } from "./matching";
import { purgeExpiredResumes } from "./privacy";

export interface TickReport {
  scheduled: number;
  processed: { id: string; kind: string; ok: boolean; detail?: string }[];
}

export async function scheduleDueWork(db: SupabaseClient, now = new Date()): Promise<number> {
  const { data: sources } = await db.from("job_sources").select("id, enabled, last_run_at, min_interval_minutes, consecutive_failures").eq("enabled", true);
  let n = 0;
  for (const s of (sources ?? []) as SourceRow[]) {
    if (isSourceDue(s, now)) {
      const { data } = await db.rpc("enqueue_task", { p_kind: "ingest_source", p_payload: { source_id: s.id }, p_dedupe_key: `ingest:${s.id}` });
      if (data) n++;
    }
  }
  // Daily retention purge
  const day = now.toISOString().slice(0, 10);
  await db.rpc("enqueue_task", { p_kind: "purge_expired", p_payload: {}, p_dedupe_key: `purge:${day}` });
  return n;
}

export async function processTasks(db: SupabaseClient, limit = 3, budgetMs = 25_000): Promise<TickReport["processed"]> {
  const started = Date.now();
  const processed: TickReport["processed"] = [];
  const { data: tasks, error } = await db.rpc("claim_tasks", { p_limit: limit });
  if (error) throw new Error(`claim_tasks: ${error.message}`);
  let ingestedAny = false;

  for (const task of (tasks ?? []) as { id: string; kind: string; payload: Record<string, string>; attempts: number; max_attempts: number }[]) {
    if (Date.now() - started > budgetMs) {
      await db.from("task_queue").update({ status: "queued", locked_at: null, attempts: task.attempts - 1 }).eq("id", task.id);
      continue;
    }
    try {
      let detail = "";
      if (task.kind === "ingest_source") {
        const { data: source } = await db.from("job_sources").select("*").eq("id", task.payload.source_id).single();
        if (!source) throw new Error("source not found");
        const r = await ingestSource(db, source as SourceRow);
        detail = `${r.status}: fetched ${r.fetched}, new ${r.inserted}, updated ${r.updated}, closed ${r.deactivated}`;
        if (r.status === "failed") throw new Error(r.errors[0] ?? "ingestion failed");
        ingestedAny = true;
      } else if (task.kind === "match_user") {
        const r = await runMatchingForUser(db, task.payload.user_id);
        detail = `scored ${r.scored}, kept ${r.kept}`;
      } else if (task.kind === "purge_expired") {
        const f = await followUpApplications(db);
        detail = `purged ${await purgeExpiredResumes(db)}; no response ${f.noResponse}; closed ${f.closed}`;
      }
      await db.from("task_queue").update({ status: "done", last_error: null }).eq("id", task.id);
      processed.push({ id: task.id, kind: task.kind, ok: true, detail });
    } catch (err) {
      const msg = (err as Error).message.slice(0, 500);
      const retry = task.attempts < task.max_attempts;
      await db
        .from("task_queue")
        .update({ status: retry ? "queued" : "failed", locked_at: null, last_error: msg, run_after: new Date(Date.now() + 60_000 * 2 ** task.attempts).toISOString() })
        .eq("id", task.id);
      processed.push({ id: task.id, kind: task.kind, ok: false, detail: msg });
    }
  }

  if (ingestedAny) await enqueueMatchingForActiveUsers(db);
  return processed;
}

/** After new jobs arrive, refresh matches for users with a confirmed profile. */
export async function enqueueMatchingForActiveUsers(db: SupabaseClient) {
  const { data } = await db.from("candidate_profiles").select("user_id").not("confirmed_at", "is", null).limit(5000);
  for (const r of data ?? []) {
    await db.rpc("enqueue_task", { p_kind: "match_user", p_payload: { user_id: r.user_id }, p_dedupe_key: `match:${r.user_id}` });
  }
}

export const NO_RESPONSE_AFTER_DAYS = 30;

/**
 * Daily housekeeping for the tracker:
 * - applied more than 30 days ago with no update → "No response"
 * - not yet applied, and the listing has gone from the employer's site → "Listing closed"
 * Users can move any of these back; a manual change clears the automatic flag.
 */
export async function followUpApplications(db: SupabaseClient, now = new Date()): Promise<{ noResponse: number; closed: number }> {
  const cutoff = new Date(now.getTime() - NO_RESPONSE_AFTER_DAYS * 86_400_000).toISOString();
  const stamp = now.toISOString();

  const { data: stale } = await db
    .from("applications")
    .update({ status: "no_response", auto_closed_at: stamp, auto_closed_reason: `No reply ${NO_RESPONSE_AFTER_DAYS} days after applying` })
    .eq("status", "applied")
    .lt("applied_at", cutoff)
    .lt("updated_at", cutoff)
    .select("user_id, job_id");
  for (const r of stale ?? []) await db.from("audit_logs").insert({ user_id: r.user_id, actor: "system", action: "application.no_response", entity: "job", entity_id: r.job_id });

  const { data: open } = await db.from("applications").select("id, user_id, job_id, jobs!inner(is_active)").in("status", ["saved", "interested", "preparing"]).eq("jobs.is_active", false).limit(1000);
  let closed = 0;
  for (const r of open ?? []) {
    await db.from("applications").update({ status: "closed", auto_closed_at: stamp, auto_closed_reason: "The listing was removed from the employer's site" }).eq("id", r.id);
    await db.from("audit_logs").insert({ user_id: r.user_id, actor: "system", action: "application.listing_closed", entity: "job", entity_id: r.job_id });
    closed++;
  }
  return { noResponse: stale?.length ?? 0, closed };
}
