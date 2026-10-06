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
        detail = `purged ${await purgeExpiredResumes(db)}`;
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
