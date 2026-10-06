import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { JOB_ROW_SELECT, type JobRowData, type MatchRowData } from "@/components/job-row";
import { FINISHED_STATUSES } from "@/lib/format";

/** Jobs the user has already applied to (or closed) — never recommend these again. */
export async function finishedJobIds(supabase: SupabaseClient, userId: string): Promise<string[]> {
  const { data } = await supabase.from("applications").select("job_id").eq("user_id", userId).in("status", [...FINISHED_STATUSES]);
  return (data ?? []).map((r) => r.job_id as string);
}

export async function interactions(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase.from("saved_jobs").select("job_id, saved, hidden, viewed_at").eq("user_id", userId);
  const saved = new Set<string>();
  const hidden = new Set<string>();
  for (const r of data ?? []) {
    if (r.saved) saved.add(r.job_id);
    if (r.hidden) hidden.add(r.job_id);
  }
  return { saved, hidden };
}

export type MatchWithJob = MatchRowData & { job_id: string; jobs: JobRowData };

export async function recommended(
  supabase: SupabaseClient,
  userId: string,
  opts: { band?: "high" | "possible" | "low"; eligibleOnly?: boolean; limit?: number; offset?: number } = {},
): Promise<{ rows: MatchWithJob[]; total: number }> {
  let q = supabase
    .from("job_matches")
    .select(`job_id, score, band, reasons, gaps, disqualifiers, breakdown, jobs!inner(${JOB_ROW_SELECT})`, { count: "exact" })
    .eq("user_id", userId)
    .eq("jobs.is_active", true)
    .order("score", { ascending: false });
  if (opts.band) q = q.eq("band", opts.band);
  if (opts.eligibleOnly) q = q.eq("disqualifiers", "{}");
  const done = await finishedJobIds(supabase, userId);
  if (done.length) q = q.not("job_id", "in", `(${done.join(",")})`);
  const limit = opts.limit ?? 40;
  q = q.range(opts.offset ?? 0, (opts.offset ?? 0) + limit - 1);
  const { data, count } = await q;
  return { rows: (data ?? []) as unknown as MatchWithJob[], total: count ?? 0 };
}
