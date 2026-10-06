// Job ingestion pipeline: fetch → normalise → verify → upsert → dedupe → deactivate missing.
import type { SupabaseClient } from "@supabase/supabase-js";
import { CONNECTORS, type SourceKind } from "../jobs/connectors";
import { normalizeJob, preferListing } from "../jobs/normalize";
import type { NormalizedJob } from "../types";

export interface SourceRow {
  id: string;
  kind: SourceKind;
  name: string;
  slug: string;
  config: Record<string, unknown>;
  enabled: boolean;
  is_official: boolean;
  min_interval_minutes: number;
  last_run_at: string | null;
  consecutive_failures: number;
}

export interface IngestSummary {
  sourceId: string;
  status: "success" | "partial" | "failed";
  fetched: number;
  inserted: number;
  updated: number;
  deactivated: number;
  flagged: number;
  duplicates: number;
  errors: string[];
}

const BATCH = 200;

function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

async function ensureEmployers(db: SupabaseClient, jobs: NormalizedJob[]): Promise<Map<string, string>> {
  const byNorm = new Map<string, { name: string; domain: string | null }>();
  for (const j of jobs) if (j.normalizedEmployer && !byNorm.has(j.normalizedEmployer)) byNorm.set(j.normalizedEmployer, { name: j.employerName, domain: j.employerDomain });
  const ids = new Map<string, string>();
  for (const part of chunk([...byNorm.entries()], BATCH)) {
    const { data, error } = await db
      .from("employers")
      .upsert(part.map(([normalized_name, v]) => ({ normalized_name, name: v.name, domain: v.domain })), { onConflict: "normalized_name", ignoreDuplicates: false })
      .select("id, normalized_name");
    if (error) throw new Error(`employers upsert: ${error.message}`);
    for (const r of data ?? []) ids.set(r.normalized_name, r.id);
  }
  return ids;
}

export async function ingestSource(db: SupabaseClient, source: SourceRow, env: Record<string, string | undefined> = process.env, now = new Date()): Promise<IngestSummary> {
  const summary: IngestSummary = { sourceId: source.id, status: "success", fetched: 0, inserted: 0, updated: 0, deactivated: 0, flagged: 0, duplicates: 0, errors: [] };
  const { data: run } = await db.from("ingestion_runs").insert({ source_id: source.id }).select("id").single();

  try {
    const connector = CONNECTORS[source.kind];
    if (!connector) throw new Error(`No connector for ${source.kind}`);
    const raw = await connector.fetchJobs({ config: source.config ?? {}, name: source.name, env });
    summary.fetched = raw.length;

    // Normalise; isolate per-listing failures so one bad record doesn't fail the run.
    const normalized: NormalizedJob[] = [];
    for (const r of raw) {
      try {
        normalized.push(normalizeJob(r, { sourceIsOfficial: source.is_official, now }));
      } catch (err) {
        summary.errors.push(`normalize ${r.externalId}: ${(err as Error).message}`);
      }
    }
    // Same-source duplicates (same title & location twice): keep the preferred one.
    const byFp = new Map<string, NormalizedJob>();
    for (const j of normalized) {
      const prev = byFp.get(j.fingerprint);
      if (prev) summary.duplicates++;
      byFp.set(j.fingerprint, prev ? preferListing(prev, j) : j);
    }
    const unique = [...byFp.values()];
    summary.flagged = unique.filter((j) => j.verificationStatus === "flagged").length;

    const employerIds = await ensureEmployers(db, unique);

    const { data: existing, error: exErr } = await db.from("jobs").select("id, external_id").eq("source_id", source.id);
    if (exErr) throw new Error(`load existing: ${exErr.message}`);
    const existingIds = new Map((existing ?? []).map((r) => [r.external_id as string, r.id as string]));

    const seenExternal = new Set<string>();
    for (const part of chunk(unique, BATCH)) {
      const rows = part.map((j) => {
        seenExternal.add(j.externalId);
        const inactive = j.verificationFlags.includes("inactive");
        return {
          source_id: source.id,
          external_id: j.externalId,
          employer_id: employerIds.get(j.normalizedEmployer) ?? null,
          employer_name: j.employerName,
          title: j.title,
          normalized_title: j.normalizedTitle,
          description_text: j.descriptionText.slice(0, 40_000),
          location_raw: j.locationRaw,
          locations: j.locations,
          countries: j.countries,
          remote_type: j.remoteType,
          remote_regions: j.remoteRegions,
          employment_type: j.employmentType,
          seniority: j.seniority,
          department: j.department,
          salary_min: j.salaryMin,
          salary_max: j.salaryMax,
          salary_currency: j.salaryCurrency,
          salary_period: j.salaryPeriod,
          posted_at: j.postedAt,
          deadline_at: j.deadlineAt,
          apply_url: j.applyUrl,
          source_url: j.sourceUrl,
          apply_domain: j.applyDomain,
          is_official_link: j.isOfficialLink,
          verification_status: j.verificationStatus,
          verification_flags: j.verificationFlags.filter((f) => f !== "inactive"),
          fingerprint: j.fingerprint,
          is_active: !inactive,
          last_seen_at: now.toISOString(),
        };
      });
      const { data: upserted, error } = await db.from("jobs").upsert(rows, { onConflict: "source_id,external_id" }).select("id, external_id, requirements_extracted_by");
      if (error) throw new Error(`jobs upsert: ${error.message}`);

      for (const j of part) {
        if (existingIds.has(j.externalId)) summary.updated++;
        else summary.inserted++;
      }

      // Replace heuristic requirements. Jobs refined by AI keep their AI requirements.
      const idByExternal = new Map(
        (upserted ?? []).filter((r) => r.requirements_extracted_by !== "ai").map((r) => [r.external_id as string, r.id as string]),
      );
      const jobIds = part.map((j) => idByExternal.get(j.externalId)).filter((x): x is string => !!x);
      if (jobIds.length) {
        const { error: delErr } = await db.from("job_requirements").delete().in("job_id", jobIds).eq("extracted_by", "heuristic");
        if (delErr) throw new Error(`requirements delete: ${delErr.message}`);
        const reqRows = part.flatMap((j) => {
          const jobId = idByExternal.get(j.externalId);
          if (!jobId) return [];
          return j.requirements.map((r) => ({
            job_id: jobId,
            kind: r.kind,
            text: r.text.slice(0, 1000),
            normalized: r.normalized ?? null,
            importance: r.importance,
            min_years: r.minYears ?? null,
            extracted_by: "heuristic",
          }));
        });
        for (const rp of chunk(reqRows, 1000)) {
          const { error: insErr } = await db.from("job_requirements").insert(rp);
          if (insErr) throw new Error(`requirements insert: ${insErr.message}`);
        }
      }
    }

    // Listings that disappeared from the source are no longer open.
    const gone = [...existingIds.entries()].filter(([ext]) => !seenExternal.has(ext)).map(([, id]) => id);
    for (const part of chunk(gone, BATCH)) {
      const { error } = await db.from("jobs").update({ is_active: false }).in("id", part).eq("is_active", true);
      if (error) throw new Error(`deactivate: ${error.message}`);
      summary.deactivated += part.length;
    }

    summary.duplicates += await dedupeAcrossSources(db, unique.map((j) => j.fingerprint));
    if (summary.errors.length) summary.status = "partial";

    await db
      .from("job_sources")
      .update({ last_run_at: now.toISOString(), last_success_at: now.toISOString(), last_error: summary.errors[0] ?? null, consecutive_failures: 0 })
      .eq("id", source.id);
  } catch (err) {
    summary.status = "failed";
    summary.errors.push((err as Error).message);
    await db
      .from("job_sources")
      .update({ last_run_at: now.toISOString(), last_error: (err as Error).message.slice(0, 500), consecutive_failures: source.consecutive_failures + 1 })
      .eq("id", source.id);
  }

  if (run?.id) {
    await db
      .from("ingestion_runs")
      .update({
        status: summary.status,
        finished_at: new Date().toISOString(),
        fetched: summary.fetched,
        inserted: summary.inserted,
        updated: summary.updated,
        deactivated: summary.deactivated,
        flagged: summary.flagged,
        duplicates: summary.duplicates,
        errors: summary.errors.slice(0, 50),
      })
      .eq("id", run.id);
  }
  return summary;
}

/**
 * Cross-source dedupe: for each fingerprint with several active listings,
 * keep the official/most recent one as canonical and point the rest at it.
 */
export async function dedupeAcrossSources(db: SupabaseClient, fingerprints: string[]): Promise<number> {
  let marked = 0;
  for (const part of chunk(Array.from(new Set(fingerprints)), 300)) {
    const { data } = await db
      .from("jobs")
      .select("id, fingerprint, is_official_link, verification_status, posted_at, duplicate_of")
      .in("fingerprint", part)
      .eq("is_active", true);
    const groups = new Map<string, NonNullable<typeof data>>();
    for (const r of data ?? []) {
      const g = groups.get(r.fingerprint) ?? [];
      g.push(r);
      groups.set(r.fingerprint, g);
    }
    for (const g of groups.values()) {
      if (g.length < 2) {
        if (g[0]?.duplicate_of) await db.from("jobs").update({ duplicate_of: null }).eq("id", g[0].id);
        continue;
      }
      const canonical = g
        .map((r) => ({ ...r, isOfficialLink: r.is_official_link, verificationStatus: r.verification_status, postedAt: r.posted_at }))
        .reduce((a, b) => preferListing(a, b));
      const others = g.filter((r) => r.id !== canonical.id && r.duplicate_of !== canonical.id).map((r) => r.id);
      if (canonical.duplicate_of) await db.from("jobs").update({ duplicate_of: null }).eq("id", canonical.id);
      if (others.length) {
        await db.from("jobs").update({ duplicate_of: canonical.id }).in("id", others);
        marked += others.length;
      }
    }
  }
  return marked;
}

/** Sources whose minimum interval has elapsed (with backoff after repeated failures). */
export function isSourceDue(s: Pick<SourceRow, "enabled" | "last_run_at" | "min_interval_minutes" | "consecutive_failures">, now = new Date()): boolean {
  if (!s.enabled) return false;
  if (!s.last_run_at) return true;
  const backoff = Math.min(2 ** s.consecutive_failures, 16);
  const due = new Date(s.last_run_at).getTime() + s.min_interval_minutes * 60_000 * backoff;
  return now.getTime() >= due;
}
