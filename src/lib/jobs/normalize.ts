import { collapseWhitespace, fnv1a64, hostnameOf, htmlToText, simplify } from "../text";
import { parseLocation } from "../geo";
import type { NormalizedJob, RawJob, RemoteType } from "../types";
import { employmentTypeFrom, extractRequirements, seniorityFromTitle } from "./requirements";
import { verifyJob } from "./verify";

export function normalizeTitle(title: string): string {
  return simplify(
    title
      .replace(/\((m|w|f|d|x|all genders?|gn)(\s*[/|,]\s*(m|w|f|d|x))*\)/gi, " ")
      .replace(/\s*[-–|,]\s*(remote|hybrid|on-?site|anywhere|worldwide)\b.*$/i, " ")
      .replace(/\((remote|hybrid|on-?site)[^)]*\)/gi, " ")
      .replace(/\bsr\.?(?=\s)/gi, "senior")
      .replace(/\bjr\.?(?=\s)/gi, "junior")
      .replace(/\beng\.?(?=\s|$)/gi, "engineer"),
  )
    .replace(/[^a-z0-9+# ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const COMPANY_SUFFIX =
  /\b(inc|incorporated|llc|l\.l\.c|ltd|limited|gmbh|ag|sa|s\.a|sas|bv|b\.v|plc|corp|corporation|co|company|pty|srl|oy|ab|as|technologies|technology|labs?|hq)\b\.?/gi;

export function normalizeEmployer(name: string): string {
  return simplify(name.replace(COMPANY_SUFFIX, " "))
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function fingerprint(employer: string, title: string, location: string): string {
  return fnv1a64(`${normalizeEmployer(employer)}|${normalizeTitle(title)}|${simplify(location)}`);
}

/** Parse salary strings such as "$120k - $150k", "€60,000–€75,000 a year", "$40/hr". */
export function parseSalaryText(raw: string | null | undefined): {
  min: number | null;
  max: number | null;
  currency: string | null;
  period: "year" | "month" | "hour" | null;
} {
  const empty = { min: null, max: null, currency: null, period: null };
  if (!raw) return empty;
  const s = raw.replace(/,/g, "").replace(/\s+/g, " ");
  const currency = /€|eur/i.test(s) ? "EUR" : /£|gbp/i.test(s) ? "GBP" : /₦|ngn/i.test(s) ? "NGN" : /\$|usd/i.test(s) ? "USD" : null;
  const nums = [...s.matchAll(/(\d+(?:\.\d+)?)\s*(k|m)?/gi)]
    .map((m) => parseFloat(m[1]) * (m[2]?.toLowerCase() === "k" ? 1000 : m[2]?.toLowerCase() === "m" ? 1_000_000 : 1))
    .filter((n) => n >= 5);
  if (nums.length === 0) return empty;
  const period = /(\/|per |an? )\s*(hr|hour)/i.test(s) ? "hour" : /(\/|per |a )\s*(mo|month)/i.test(s) ? "month" : "year";
  const min = Math.min(...nums.slice(0, 2));
  const max = Math.max(...nums.slice(0, 2));
  return { min: Math.round(min), max: Math.round(max), currency, period };
}

export interface NormalizeContext {
  sourceIsOfficial: boolean;
  now?: Date;
}

export function normalizeJob(raw: RawJob, ctx: NormalizeContext): NormalizedJob {
  const title = collapseWhitespace(raw.title);
  const employerName = collapseWhitespace(raw.employerName);
  const descriptionText = raw.descriptionText?.trim() || (raw.descriptionHtml ? htmlToText(raw.descriptionHtml) : "");

  const locationParts = [raw.locationRaw, ...(raw.locations ?? [])];
  const loc = parseLocation(locationParts, raw.remoteHint);
  const countries = Array.from(new Set([...(raw.countryCodes ?? []).map((c) => c.toUpperCase()), ...loc.countries]));

  const requirements = extractRequirements(descriptionText, { employerName, tags: raw.tags });

  // A remote job whose location string doesn't say where may still restrict
  // eligible countries in the description text ("must be based in the US").
  let remoteRegions = loc.remoteRegions;
  let remoteType: RemoteType = loc.remoteType;
  if (remoteType === "remote" && remoteRegions.length === 0) {
    const based = requirements.find((r) => r.kind === "location" && r.normalized?.startsWith("based:"));
    if (based) remoteRegions = based.normalized!.slice("based:".length).split(",");
    else if (raw.countryCodes?.length) remoteRegions = raw.countryCodes.map((c) => c.toUpperCase());
  }
  if (remoteType === "unknown" && /\bremote\b/i.test(title)) remoteType = "remote";

  const salaryFromText = raw.salary?.raw ? parseSalaryText(raw.salary.raw) : null;
  const round = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? null : Math.round(n));
  const salaryMin = round(raw.salary?.min ?? salaryFromText?.min);
  const salaryMax = round(raw.salary?.max ?? salaryFromText?.max);
  const salaryCurrency = raw.salary?.currency ?? salaryFromText?.currency ?? null;
  const salaryPeriod = raw.salary?.period ?? salaryFromText?.period ?? (salaryMin ? "year" : null);

  const applyUrl = raw.applyUrl || raw.sourceUrl || null;
  const applyDomain = hostnameOf(applyUrl);
  const employerDomain = hostnameOf(raw.employerWebsite);

  const verification = verifyJob({
    title,
    descriptionText,
    applyUrl,
    applyDomain,
    employerDomain,
    sourceIsOfficial: ctx.sourceIsOfficial,
    postedAt: raw.postedAt ?? null,
    deadlineAt: raw.deadlineAt ?? null,
    salaryMax,
    salaryPeriod,
    now: ctx.now,
  });

  const primaryLocation = remoteType === "remote" ? `remote:${remoteRegions.sort().join(",")}` : (countries.sort().join(",") || raw.locationRaw || "");

  return {
    externalId: raw.externalId,
    title,
    normalizedTitle: normalizeTitle(title),
    employerName,
    normalizedEmployer: normalizeEmployer(employerName),
    employerDomain,
    descriptionText,
    locationRaw: raw.locationRaw ?? (raw.locations?.join(" · ") || null),
    locations: raw.locations ?? (raw.locationRaw ? [raw.locationRaw] : []),
    countries,
    remoteType,
    remoteRegions,
    employmentType: raw.employmentType ? employmentTypeFrom(raw.employmentType) ?? raw.employmentType : employmentTypeFrom(title),
    seniority: seniorityFromTitle(title),
    department: raw.department ?? null,
    salaryMin,
    salaryMax,
    salaryCurrency,
    salaryPeriod,
    postedAt: raw.postedAt ?? null,
    deadlineAt: raw.deadlineAt ?? null,
    applyUrl,
    sourceUrl: raw.sourceUrl ?? null,
    applyDomain,
    isOfficialLink: verification.isOfficialLink,
    fingerprint: fingerprint(employerName, title, primaryLocation),
    requirements,
    verificationStatus: verification.status,
    verificationFlags: verification.flags.concat(verification.inactive ? ["inactive"] : []),
  };
}

/**
 * Choose which of two listings with the same fingerprint is canonical:
 * official employer links beat aggregators, then the more recently posted.
 */
export function preferListing<T extends { isOfficialLink: boolean; verificationStatus: string; postedAt: string | null }>(a: T, b: T): T {
  const rank = (j: T) => (j.verificationStatus === "flagged" ? 0 : j.isOfficialLink ? 2 : 1);
  if (rank(a) !== rank(b)) return rank(a) > rank(b) ? a : b;
  return (a.postedAt ?? "") >= (b.postedAt ?? "") ? a : b;
}
