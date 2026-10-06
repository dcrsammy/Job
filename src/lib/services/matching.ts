// Runs the matching engine for one user and stores the results.
import type { SupabaseClient } from "@supabase/supabase-js";
import { matching, planFeatures } from "../config";
import { prepareCandidate, scoreMatch, ENGINE_VERSION } from "../matching/engine";
import { ROLE_FAMILY_BY_KEY } from "../matching/role-families";
import { skillDisplayName } from "../skills/taxonomy";
import type { JobForMatch, JobRequirement, MatchResult } from "../types";
import { loadCandidate, toCandidateForMatch } from "./candidate";
import { getPlan } from "./usage";

interface JobRowForMatch {
  id: string;
  title: string;
  normalized_title: string;
  seniority: JobForMatch["seniority"];
  remote_type: JobForMatch["remoteType"];
  remote_regions: string[];
  countries: string[];
  department: string | null;
  description_text: string;
  job_requirements: { kind: JobRequirement["kind"]; text: string; normalized: string | null; importance: "required" | "preferred"; min_years: number | null }[];
}

export function rowToJobForMatch(j: JobRowForMatch): JobForMatch {
  return {
    id: j.id,
    title: j.title,
    normalizedTitle: j.normalized_title,
    seniority: j.seniority,
    remoteType: j.remote_type,
    remoteRegions: j.remote_regions ?? [],
    countries: j.countries ?? [],
    requirements: (j.job_requirements ?? []).map((r) => ({ kind: r.kind, text: r.text, normalized: r.normalized, importance: r.importance, minYears: r.min_years })),
    domainText: `${j.title}\n${j.department ?? ""}\n${(j.description_text ?? "").slice(0, 3000)}`,
  };
}

export const JOB_MATCH_SELECT =
  "id, title, normalized_title, seniority, remote_type, remote_regions, countries, department, description_text, job_requirements(kind, text, normalized, importance, min_years)";

export function matchToRow(userId: string, jobId: string, m: MatchResult) {
  return {
    user_id: userId,
    job_id: jobId,
    score: m.score,
    band: m.band,
    breakdown: { label: m.label, components: m.components, adjustments: m.adjustments, matchedSkills: m.matchedSkills, missingRequiredSkills: m.missingRequiredSkills, missingPreferredSkills: m.missingPreferredSkills },
    reasons: m.reasons,
    gaps: m.gaps,
    disqualifiers: m.disqualifiers,
    uncertain: m.uncertain,
    engine_version: m.engineVersion,
    computed_at: new Date().toISOString(),
  };
}

export async function runMatchingForUser(db: SupabaseClient, userId: string): Promise<{ scored: number; kept: number }> {
  const full = await loadCandidate(db, userId);
  if (!full) return { scored: 0, kept: 0 };
  const candidate = prepareCandidate(toCandidateForMatch(full));

  // Search terms: skills + role family labels + recent job titles.
  const terms = Array.from(
    new Set([
      ...[...candidate.skills].map(skillDisplayName),
      ...candidate.families.map((f) => ROLE_FAMILY_BY_KEY.get(f)?.label.split(/[/&]/)[0].trim() ?? f),
      ...full.experiences.slice(0, 3).map((e) => e.title),
    ]),
  ).slice(0, 60);
  const since = new Date(Date.now() - matching.maxJobAgeDays * 86_400_000).toISOString();
  const { data: ids, error } = await db.rpc("match_candidate_jobs", { p_terms: terms, p_since: since, p_limit: matching.candidatePool });
  if (error) throw new Error(`match_candidate_jobs: ${error.message}`);
  // Jobs already applied to (or closed) are never suggested again.
  const { data: doneRows } = await db
    .from("applications")
    .select("job_id")
    .eq("user_id", userId)
    .in("status", ["applied", "interview", "offer", "rejected", "withdrawn", "no_response", "closed"]);
  const done = new Set((doneRows ?? []).map((r) => r.job_id as string));
  const jobIds = (ids ?? []).map((r: { id: string }) => r.id).filter((id: string) => !done.has(id));

  const results: { jobId: string; m: MatchResult }[] = [];
  for (let i = 0; i < jobIds.length; i += 200) {
    const { data: jobs, error: jErr } = await db.from("jobs").select(JOB_MATCH_SELECT).in("id", jobIds.slice(i, i + 200));
    if (jErr) throw new Error(`load jobs: ${jErr.message}`);
    for (const j of (jobs ?? []) as unknown as JobRowForMatch[]) {
      results.push({ jobId: j.id, m: scoreMatch(candidate, rowToJobForMatch(j)) });
    }
  }

  results.sort((a, b) => b.m.score - a.m.score);
  const keepTop = planFeatures[await getPlan(db, userId)].matchesKept ?? matching.keepTop;
  const keep = results.slice(0, keepTop);
  for (let i = 0; i < keep.length; i += 200) {
    const rows = keep.slice(i, i + 200).map(({ jobId, m }) => matchToRow(userId, jobId, m));
    const { error: upErr } = await db.from("job_matches").upsert(rows, { onConflict: "user_id,job_id" });
    if (upErr) throw new Error(`save matches: ${upErr.message}`);
  }
  // Drop matches that fell out of the top set (or are from an older engine version).
  const keepIds = new Set(keep.map((k) => k.jobId));
  const { data: old } = await db.from("job_matches").select("job_id, engine_version").eq("user_id", userId);
  const stale = (old ?? []).filter((o) => !keepIds.has(o.job_id) || o.engine_version !== ENGINE_VERSION).map((o) => o.job_id);
  for (let i = 0; i < stale.length; i += 200) {
    await db.from("job_matches").delete().eq("user_id", userId).in("job_id", stale.slice(i, i + 200));
  }
  return { scored: results.length, kept: keep.length };
}

/** Score a single job on the fly (for job pages reached via search). */
export async function scoreSingleJob(db: SupabaseClient, userId: string, jobId: string): Promise<MatchResult | null> {
  const [full, { data: job }] = await Promise.all([loadCandidate(db, userId), db.from("jobs").select(JOB_MATCH_SELECT).eq("id", jobId).maybeSingle()]);
  if (!full || !job) return null;
  return scoreMatch(toCandidateForMatch(full), rowToJobForMatch(job as unknown as JobRowForMatch));
}
