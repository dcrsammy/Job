// Source connectors. Each one calls a public, documented job API (or reads
// schema.org JobPosting data from an employer careers page, honouring
// robots.txt) and returns RawJob records.
import { fetchJson, politeFetch, robotsAllows } from "./http";
import { htmlToText } from "../text";
import { findCountries } from "../geo";
import type { RawJob, RemoteType } from "../types";

export type SourceKind = "greenhouse" | "lever" | "ashby" | "remotive" | "arbeitnow" | "remoteok" | "adzuna" | "jsonld";

export interface ConnectorContext {
  config: Record<string, unknown>;
  /** Display name of the source (used as employer name when the API omits it). */
  name: string;
  fetchImpl?: typeof fetch;
  env?: Record<string, string | undefined>;
}

export interface Connector {
  kind: SourceKind;
  fetchJobs(ctx: ConnectorContext): Promise<RawJob[]>;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function requireConfig(ctx: ConnectorContext, key: string): string {
  const v = str(ctx.config[key]);
  if (!v || !/^[A-Za-z0-9_.-]+$/.test(v)) throw new Error(`Source config "${key}" is missing or invalid`);
  return v;
}

function workplace(v: unknown): RemoteType | null {
  const s = String(v ?? "").toLowerCase();
  if (s.includes("hybrid")) return "hybrid";
  if (s.includes("remote")) return "remote";
  if (s.includes("onsite") || s.includes("on-site") || s.includes("office")) return "onsite";
  return null;
}

// ---------------------------------------------------------------------------
// Greenhouse job board API — https://developers.greenhouse.io/job-board.html
// ---------------------------------------------------------------------------
interface GreenhouseJob {
  id: number;
  title: string;
  absolute_url: string;
  updated_at?: string;
  first_published?: string;
  company_name?: string;
  location?: { name?: string };
  content?: string;
  departments?: { name: string }[];
  offices?: { name: string; location?: string | null }[];
  application_deadline?: string | null;
  metadata?: { name: string; value: unknown }[] | null;
}

export const greenhouse: Connector = {
  kind: "greenhouse",
  async fetchJobs(ctx) {
    const board = requireConfig(ctx, "board");
    const data = await fetchJson<{ jobs: GreenhouseJob[] }>(
      `https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true`,
      { fetchImpl: ctx.fetchImpl },
    );
    return (data.jobs ?? []).map((j) => {
      const offices = (j.offices ?? []).map((o) => o.location || o.name).filter(Boolean) as string[];
      const typeMeta = j.metadata?.find((m) => /employment|time type|job type/i.test(m.name));
      return {
        externalId: String(j.id),
        title: j.title,
        employerName: ctx.name || j.company_name || "Unknown employer",
        descriptionHtml: j.content ?? "",
        locationRaw: j.location?.name ?? null,
        locations: Array.from(new Set([j.location?.name, ...offices].filter(Boolean) as string[])),
        department: j.departments?.[0]?.name ?? null,
        employmentType: typeof typeMeta?.value === "string" ? typeMeta.value : null,
        postedAt: j.first_published ?? j.updated_at ?? null,
        deadlineAt: j.application_deadline ?? null,
        applyUrl: j.absolute_url,
        sourceUrl: j.absolute_url,
        employerWebsite: str(ctx.config.website),
      } satisfies RawJob;
    });
  },
};

// ---------------------------------------------------------------------------
// Lever postings API — https://github.com/lever/postings-api
// ---------------------------------------------------------------------------
interface LeverPosting {
  id: string;
  text: string;
  hostedUrl: string;
  applyUrl?: string;
  createdAt?: number;
  country?: string | null;
  workplaceType?: string;
  categories?: { commitment?: string; department?: string; location?: string; team?: string; allLocations?: string[] };
  descriptionPlain?: string;
  lists?: { text: string; content: string }[];
  additionalPlain?: string;
  salaryRange?: { min?: number; max?: number; currency?: string; interval?: string };
}

export const lever: Connector = {
  kind: "lever",
  async fetchJobs(ctx) {
    const company = requireConfig(ctx, "company");
    const region = str(ctx.config.region) === "eu" ? "api.eu.lever.co" : "api.lever.co";
    const data = await fetchJson<LeverPosting[]>(`https://${region}/v0/postings/${company}?mode=json`, {
      fetchImpl: ctx.fetchImpl,
    });
    return (Array.isArray(data) ? data : []).map((p) => {
      const lists = (p.lists ?? []).map((l) => `${l.text}\n${htmlToText(l.content)}`).join("\n\n");
      const interval = p.salaryRange?.interval ?? "";
      return {
        externalId: p.id,
        title: p.text,
        employerName: ctx.name,
        descriptionText: [p.descriptionPlain, lists, p.additionalPlain].filter(Boolean).join("\n\n"),
        locationRaw: p.categories?.location ?? null,
        locations: p.categories?.allLocations ?? (p.categories?.location ? [p.categories.location] : []),
        countryCodes: p.country ? [p.country] : [],
        remoteHint: workplace(p.workplaceType),
        employmentType: p.categories?.commitment ?? null,
        department: p.categories?.department ?? p.categories?.team ?? null,
        salary: p.salaryRange
          ? {
              min: p.salaryRange.min ?? null,
              max: p.salaryRange.max ?? null,
              currency: p.salaryRange.currency ?? null,
              period: /hour/i.test(interval) ? "hour" : /month/i.test(interval) ? "month" : "year",
            }
          : null,
        postedAt: p.createdAt ? new Date(p.createdAt).toISOString() : null,
        applyUrl: p.applyUrl ?? p.hostedUrl,
        sourceUrl: p.hostedUrl,
        employerWebsite: str(ctx.config.website),
      } satisfies RawJob;
    });
  },
};

// ---------------------------------------------------------------------------
// Ashby job posting API — https://developers.ashbyhq.com/docs/public-job-posting-api
// ---------------------------------------------------------------------------
interface AshbyJob {
  id: string;
  title: string;
  department?: string;
  team?: string;
  employmentType?: string;
  location?: string;
  secondaryLocations?: { location: string }[];
  publishedAt?: string;
  isListed?: boolean;
  isRemote?: boolean;
  workplaceType?: string;
  address?: { postalAddress?: { addressCountry?: string } };
  jobUrl: string;
  applyUrl?: string;
  descriptionPlain?: string;
  descriptionHtml?: string;
  compensation?: {
    summaryComponents?: { compensationType: string; interval: string; currencyCode: string | null; minValue: number | null; maxValue: number | null }[];
  };
}

export const ashby: Connector = {
  kind: "ashby",
  async fetchJobs(ctx) {
    const board = requireConfig(ctx, "board");
    const data = await fetchJson<{ jobs: AshbyJob[] }>(
      `https://api.ashbyhq.com/posting-api/job-board/${board}?includeCompensation=true`,
      { fetchImpl: ctx.fetchImpl },
    );
    return (data.jobs ?? [])
      .filter((j) => j.isListed !== false)
      .map((j) => {
        const salary = j.compensation?.summaryComponents?.find((c) => c.compensationType === "Salary" && c.minValue);
        const country = j.address?.postalAddress?.addressCountry;
        return {
          externalId: j.id,
          title: j.title,
          employerName: ctx.name,
          descriptionText: j.descriptionPlain ?? null,
          descriptionHtml: j.descriptionPlain ? null : j.descriptionHtml ?? null,
          locationRaw: j.location ?? null,
          locations: [j.location, ...(j.secondaryLocations ?? []).map((s) => s.location), country].filter(Boolean) as string[],
          remoteHint: workplace(j.workplaceType) ?? (j.isRemote ? "remote" : null),
          employmentType: j.employmentType ?? null,
          department: j.department ?? j.team ?? null,
          salary: salary
            ? {
                min: salary.minValue,
                max: salary.maxValue,
                currency: salary.currencyCode,
                period: /HOUR/.test(salary.interval) ? "hour" : /MONTH/.test(salary.interval) ? "month" : "year",
              }
            : null,
          postedAt: j.publishedAt ?? null,
          applyUrl: j.applyUrl ?? j.jobUrl,
          sourceUrl: j.jobUrl,
          employerWebsite: str(ctx.config.website),
        } satisfies RawJob;
      });
  },
};

// ---------------------------------------------------------------------------
// Remote OK — https://remoteok.com/api (terms: link back + credit Remote OK)
// ---------------------------------------------------------------------------
interface RemoteOkJob {
  id?: string;
  slug?: string;
  date?: string;
  company?: string;
  position?: string;
  tags?: string[];
  description?: string;
  location?: string;
  salary_min?: number;
  salary_max?: number;
  url?: string;
  apply_url?: string;
  legal?: string;
}

export const remoteok: Connector = {
  kind: "remoteok",
  async fetchJobs(ctx) {
    const data = await fetchJson<RemoteOkJob[]>("https://remoteok.com/api", { fetchImpl: ctx.fetchImpl });
    return data
      .filter((j) => j.id && j.position && !j.legal)
      .map((j) => ({
        externalId: String(j.id),
        title: j.position!,
        employerName: j.company || "Unknown employer",
        descriptionHtml: j.description ?? "",
        locationRaw: j.location?.trim() ? `Remote · ${j.location}` : "Remote",
        remoteHint: "remote" as const,
        tags: j.tags ?? [],
        salary: j.salary_min && j.salary_max ? { min: j.salary_min, max: j.salary_max, currency: "USD", period: "year" as const } : null,
        postedAt: j.date ?? null,
        // Remote OK's terms require linking back to the listing on Remote OK.
        applyUrl: j.url ?? j.apply_url ?? null,
        sourceUrl: j.url ?? null,
      }));
  },
};

// ---------------------------------------------------------------------------
// Arbeitnow — https://www.arbeitnow.com/api/job-board-api
// ---------------------------------------------------------------------------
interface ArbeitnowJob {
  slug: string;
  company_name: string;
  title: string;
  description: string;
  remote: boolean;
  url: string;
  tags?: string[];
  job_types?: string[];
  location?: string;
  created_at?: number;
}

export const arbeitnow: Connector = {
  kind: "arbeitnow",
  async fetchJobs(ctx) {
    const maxPages = Math.min(Number(ctx.config.maxPages ?? 3) || 3, 10);
    const remoteOnly = ctx.config.remoteOnly !== false;
    const out: RawJob[] = [];
    let url: string | null = "https://www.arbeitnow.com/api/job-board-api";
    for (let page = 0; page < maxPages && url; page++) {
      const data: { data: ArbeitnowJob[]; links?: { next?: string | null } } = await fetchJson(url, { fetchImpl: ctx.fetchImpl });
      for (const j of data.data ?? []) {
        if (remoteOnly && !j.remote) continue;
        out.push({
          externalId: j.slug,
          title: j.title,
          employerName: j.company_name,
          descriptionHtml: j.description,
          locationRaw: j.remote ? `Remote · ${j.location ?? ""}`.trim() : j.location ?? null,
          // Arbeitnow is a German job board: unless another country is named, roles are Germany-based.
          countryCodes: findCountries(j.location ?? "").length ? findCountries(j.location ?? "") : ["DE"],
          remoteHint: j.remote ? "remote" : null,
          employmentType: j.job_types?.join(", ") || null,
          tags: j.tags ?? [],
          postedAt: j.created_at ? new Date(j.created_at * 1000).toISOString() : null,
          applyUrl: j.url,
          sourceUrl: j.url,
        });
      }
      url = data.links?.next ?? null;
    }
    return out;
  },
};

// ---------------------------------------------------------------------------
// Remotive — https://remotive.com/api-documentation
// NOTE: Remotive's terms prohibit showing their jobs to collect sign-ups.
// The seeded source is disabled; enable only with a commercial agreement.
// ---------------------------------------------------------------------------
interface RemotiveJob {
  id: number;
  url: string;
  title: string;
  company_name: string;
  category?: string;
  tags?: string[];
  job_type?: string;
  publication_date?: string;
  candidate_required_location?: string;
  salary?: string;
  description?: string;
}

export const remotive: Connector = {
  kind: "remotive",
  async fetchJobs(ctx) {
    const data = await fetchJson<{ jobs: RemotiveJob[] }>("https://remotive.com/api/remote-jobs", { fetchImpl: ctx.fetchImpl });
    return (data.jobs ?? []).map((j) => ({
      externalId: String(j.id),
      title: j.title,
      employerName: j.company_name?.trim() || "Unknown employer",
      descriptionHtml: j.description ?? "",
      locationRaw: `Remote · ${j.candidate_required_location || "Anywhere"}`,
      remoteHint: "remote" as const,
      employmentType: j.job_type ?? null,
      department: j.category ?? null,
      tags: j.tags ?? [],
      salary: j.salary ? { raw: j.salary } : null,
      postedAt: j.publication_date ? new Date(j.publication_date + (j.publication_date.endsWith("Z") ? "" : "Z")).toISOString() : null,
      applyUrl: j.url,
      sourceUrl: j.url,
    }));
  },
};

// ---------------------------------------------------------------------------
// Adzuna — https://developer.adzuna.com (requires ADZUNA_APP_ID / ADZUNA_APP_KEY)
// ---------------------------------------------------------------------------
interface AdzunaResult {
  id: string;
  title: string;
  description: string;
  redirect_url: string;
  created: string;
  company?: { display_name?: string };
  location?: { display_name?: string; area?: string[] };
  salary_min?: number;
  salary_max?: number;
  contract_time?: string;
}

export const adzuna: Connector = {
  kind: "adzuna",
  async fetchJobs(ctx) {
    const appId = ctx.env?.ADZUNA_APP_ID;
    const appKey = ctx.env?.ADZUNA_APP_KEY;
    if (!appId || !appKey) throw new Error("ADZUNA_APP_ID / ADZUNA_APP_KEY are not set");
    const country = (str(ctx.config.country) ?? "gb").toLowerCase();
    if (!/^[a-z]{2}$/.test(country)) throw new Error("Invalid Adzuna country");
    const what = str(ctx.config.what) ?? "remote";
    const pages = Math.min(Number(ctx.config.maxPages ?? 2) || 2, 5);
    const currency = { gb: "GBP", us: "USD", de: "EUR", fr: "EUR", nl: "EUR", ca: "CAD", au: "AUD", za: "ZAR", in: "INR" }[country] ?? null;
    const out: RawJob[] = [];
    for (let page = 1; page <= pages; page++) {
      const params = new URLSearchParams({ app_id: appId, app_key: appKey, results_per_page: "50", what, "content-type": "application/json" });
      const data = await fetchJson<{ results: AdzunaResult[] }>(
        `https://api.adzuna.com/v1/api/jobs/${country}/search/${page}?${params}`,
        { fetchImpl: ctx.fetchImpl },
      );
      for (const r of data.results ?? []) {
        out.push({
          externalId: r.id,
          title: htmlToText(r.title),
          employerName: r.company?.display_name ?? "Unknown employer",
          // Adzuna only provides a snippet; the full listing is on the redirect page.
          descriptionText: htmlToText(r.description),
          locationRaw: r.location?.display_name ?? null,
          countryCodes: [country === "gb" ? "GB" : country.toUpperCase()],
          employmentType: r.contract_time ?? null,
          salary: r.salary_min ? { min: Math.round(r.salary_min), max: Math.round(r.salary_max ?? r.salary_min), currency, period: "year" } : null,
          postedAt: r.created,
          applyUrl: r.redirect_url,
          sourceUrl: r.redirect_url,
        });
      }
      if ((data.results ?? []).length < 50) break;
    }
    return out;
  },
};

// ---------------------------------------------------------------------------
// Employer careers page with schema.org JobPosting JSON-LD.
// config: { "urls": ["https://example.com/careers/123", ...], "employer": "Example" }
// Only fetches pages robots.txt allows, one at a time, with a delay.
// ---------------------------------------------------------------------------
interface JsonLdPosting {
  "@type"?: string | string[];
  title?: string;
  description?: string;
  datePosted?: string;
  validThrough?: string;
  employmentType?: string | string[];
  hiringOrganization?: { name?: string; sameAs?: string; url?: string };
  jobLocation?: unknown;
  jobLocationType?: string;
  applicantLocationRequirements?: unknown;
  baseSalary?: { currency?: string; value?: { minValue?: number; maxValue?: number; value?: number; unitText?: string } };
  url?: string;
  identifier?: { value?: string } | string;
}

function collectJobPostings(node: unknown, out: JsonLdPosting[]) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const n of node) collectJobPostings(n, out);
    return;
  }
  const obj = node as Record<string, unknown>;
  const type = obj["@type"];
  if (type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"))) out.push(obj as JsonLdPosting);
  if (obj["@graph"]) collectJobPostings(obj["@graph"], out);
}

export function extractJsonLdPostings(html: string): JsonLdPosting[] {
  const out: JsonLdPosting[] = [];
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      collectJobPostings(JSON.parse(m[1].trim()), out);
    } catch {
      // ignore malformed blocks
    }
  }
  return out;
}

function placeText(loc: unknown): string[] {
  const list = Array.isArray(loc) ? loc : loc ? [loc] : [];
  return list
    .map((l) => {
      const a = (l as { address?: Record<string, string> }).address ?? (l as Record<string, string>);
      if (typeof a === "string") return a;
      return [a.addressLocality, a.addressRegion, a.addressCountry].filter((x) => typeof x === "string").join(", ") || (a as { name?: string }).name || "";
    })
    .filter(Boolean);
}

export const jsonld: Connector = {
  kind: "jsonld",
  async fetchJobs(ctx) {
    const urls = Array.isArray(ctx.config.urls) ? (ctx.config.urls as unknown[]).filter((u): u is string => typeof u === "string") : [];
    if (urls.length === 0) throw new Error('Source config "urls" must list careers page URLs');
    const out: RawJob[] = [];
    for (const url of urls.slice(0, 200)) {
      if (!/^https:\/\//.test(url)) continue;
      if (!(await robotsAllows(url, ctx.fetchImpl))) continue;
      const res = await politeFetch(url, { fetchImpl: ctx.fetchImpl, headers: { Accept: "text/html" } });
      const html = await res.text();
      for (const p of extractJsonLdPostings(html)) {
        const locs = placeText(p.jobLocation);
        const remote = p.jobLocationType === "TELECOMMUTE";
        const reqLocs = placeText(p.applicantLocationRequirements);
        const v = p.baseSalary?.value;
        const id = typeof p.identifier === "string" ? p.identifier : p.identifier?.value;
        out.push({
          externalId: id || p.url || url,
          title: p.title ?? "Untitled role",
          employerName: p.hiringOrganization?.name ?? str(ctx.config.employer) ?? ctx.name,
          descriptionHtml: p.description ?? "",
          locationRaw: remote ? `Remote${reqLocs.length ? " · " + reqLocs.join(", ") : ""}` : locs.join(" | ") || null,
          locations: remote ? reqLocs : locs,
          remoteHint: remote ? "remote" : null,
          employmentType: Array.isArray(p.employmentType) ? p.employmentType.join(", ") : p.employmentType ?? null,
          salary: v
            ? {
                min: v.minValue ?? v.value ?? null,
                max: v.maxValue ?? v.value ?? null,
                currency: p.baseSalary?.currency ?? null,
                period: /HOUR/i.test(v.unitText ?? "") ? "hour" : /MONTH/i.test(v.unitText ?? "") ? "month" : "year",
              }
            : null,
          postedAt: p.datePosted ?? null,
          deadlineAt: p.validThrough ?? null,
          applyUrl: p.url ?? url,
          sourceUrl: url,
          employerWebsite: p.hiringOrganization?.sameAs ?? p.hiringOrganization?.url ?? str(ctx.config.website) ?? url,
        });
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    return out;
  },
};

export const CONNECTORS: Record<SourceKind, Connector> = {
  greenhouse,
  lever,
  ashby,
  remoteok,
  arbeitnow,
  remotive,
  adzuna,
  jsonld,
};
