// Explainable candidate–job scoring.
//
// The score is a sum of transparent components (max points in brackets):
//   skills [45] · role relevance [15] · seniority & years [15] · education [5]
//   location / remote [10] · eligibility: work authorisation & language [5]
//   industry / domain [5]
// Hard blockers (e.g. "remote, US only" for someone in Nigeria) are listed as
// disqualifiers and cap the score at 35 so the job lands in "low fit".
// No LLM is involved in scoring.
import { matching } from "../config";
import { countryInRegion, countryName, remoteEligibility, REGIONS } from "../geo";
import { extractEducation, seniorityFromYears } from "../jobs/requirements";
import { findSkills, IMPLIES, normalizeSkillName, skillDisplayName } from "../skills/taxonomy";
import { jaccard, tokens } from "../text";
import {
  EDUCATION_ORDER,
  SENIORITY_ORDER,
  type CandidateForMatch,
  type ComponentScore,
  type EducationLevel,
  type JobForMatch,
  type MatchResult,
  type Seniority,
} from "../types";
import { detectIndustries, INDUSTRY_LABEL } from "./industries";
import { familySimilarity, roleFamiliesForTitle } from "./role-families";

export const ENGINE_VERSION = "1.4.0";

export const WEIGHTS = {
  skills: 45,
  role: 15,
  seniority: 15,
  education: 5,
  location: 10,
  authorization: 5,
  domain: 5,
} as const;

const DISQUALIFIED_CAP = 35;
/** A role in a completely different field stays in "low fit" however many keywords overlap. */
const DIFFERENT_FIELD_CAP = 50;
/** A "strong match" needs most of the key skills, whatever the other factors say. */
const STRONG_MIN_SKILL_RATIO = 0.6;

const list = (xs: string[], max = 4) =>
  xs.length <= max ? xs.join(", ") : `${xs.slice(0, max).join(", ")} and ${xs.length - max} more`;

function regionsLabel(codes: string[]): string {
  return list(codes.map((c) => (REGIONS[c] ? REGIONS[c].label : countryName(c))), 3);
}

const SENIORITY_LABEL: Record<Seniority, string> = {
  intern: "intern",
  junior: "junior",
  mid: "mid-level",
  senior: "senior",
  lead: "lead / staff",
  principal: "principal",
  executive: "executive",
  unknown: "unspecified",
};

// ---------------------------------------------------------------------------
// Candidate preprocessing (done once per candidate, reused for every job)
// ---------------------------------------------------------------------------
export interface PreparedCandidate {
  raw: CandidateForMatch;
  skills: Set<string>;
  impliedSkills: Set<string>;
  families: string[];
  titleTokens: string[][];
  years: number | null;
  level: Seniority;
  educationLevel: EducationLevel | null;
  certifications: string[];
  countries: string[];
  languages: Set<string>;
  industries: Set<string>;
}

export function prepareCandidate(c: CandidateForMatch): PreparedCandidate {
  const skills = new Set<string>();
  for (const s of c.skills) skills.add(s.normalized || normalizeSkillName(s.name));
  for (const e of c.experiences) for (const s of e.skills ?? []) skills.add(normalizeSkillName(s));
  const impliedSkills = new Set<string>();
  for (const s of skills) for (const i of IMPLIES[s] ?? []) if (!skills.has(i)) impliedSkills.add(i);

  const families = new Set<string>(c.roleFamilies);
  for (const e of c.experiences.slice(0, 4)) for (const f of roleFamiliesForTitle(e.title)) families.add(f);

  let educationLevel: EducationLevel | null = null;
  const certifications: string[] = [];
  for (const e of c.educations) {
    if (e.kind === "certification") {
      certifications.push(`${e.qualification ?? ""} ${e.institution}`.toLowerCase());
      continue;
    }
    const level = e.level ?? extractEducation(`${e.qualification ?? ""} ${e.field ?? ""}`)?.level ?? null;
    if (level && EDUCATION_ORDER.includes(level) && (!educationLevel || EDUCATION_ORDER.indexOf(level) > EDUCATION_ORDER.indexOf(educationLevel))) {
      educationLevel = level;
    }
  }

  const countries = Array.from(new Set([c.baseCountry, ...c.authorizedCountries].filter(Boolean) as string[]));
  const level = c.seniority !== "unknown" ? c.seniority : seniorityFromYears(c.yearsExperience);

  return {
    raw: c,
    skills,
    impliedSkills,
    families: [...families],
    titleTokens: c.experiences.slice(0, 5).map((e) => tokens(e.title)),
    years: c.yearsExperience,
    level,
    educationLevel,
    certifications,
    countries,
    languages: new Set(c.languages.map((l) => l.toLowerCase().trim())),
    industries: new Set(c.industries),
  };
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------
export function scoreMatch(candidate: CandidateForMatch | PreparedCandidate, job: JobForMatch): MatchResult {
  const c = "raw" in candidate ? candidate : prepareCandidate(candidate);
  const components: ComponentScore[] = [];
  const reasons: string[] = [];
  const gaps: string[] = [];
  const disqualifiers: string[] = [];
  const uncertain: string[] = [];
  let differentField = false;
  let skillRatio: number | null = null;
  const adjustments: string[] = [];

  // ---- Skills ------------------------------------------------------------
  // Required skills count most; skills named in the job title are core and
  // count double; long lists have diminishing weight (listings often name far
  // more tools than the job really needs).
  const skillReqs = job.requirements.filter((r) => r.kind === "skill" && r.normalized);
  const matchedSkills: string[] = [];
  const missingRequiredSkills: string[] = [];
  const missingPreferredSkills: string[] = [];
  const missingCoreSkills: string[] = [];
  {
    const max = WEIGHTS.skills;
    const titleSkills = new Set(findSkills(job.title));
    if (skillReqs.length === 0 && titleSkills.size === 0) {
      components.push({ key: "skills", label: "Skills", points: Math.round(max * 0.5), max, status: "unknown", detail: "The listing doesn't name specific skills." });
      uncertain.push("The listing doesn't name specific skills, so skill fit is estimated.");
    } else {
      const credit = (slug: string) => (c.skills.has(slug) ? 1 : c.impliedSkills.has(slug) ? 0.6 : 0);
      const required = new Map<string, number>();
      const preferred = new Map<string, number>();
      for (const slug of titleSkills) required.set(slug, 2);
      for (const r of skillReqs) {
        const slug = r.normalized!;
        if (required.has(slug)) continue;
        if (r.importance === "required") required.set(slug, 1);
        else preferred.set(slug, 1);
      }
      let reqCredit = 0;
      let reqWeight = 0;
      for (const [slug, w] of required) {
        const cr = credit(slug);
        reqCredit += cr * w;
        reqWeight += w;
        if (cr > 0) matchedSkills.push(slug);
        else {
          missingRequiredSkills.push(slug);
          if (titleSkills.has(slug)) missingCoreSkills.push(slug);
        }
      }
      let prefCredit = 0;
      for (const [slug] of preferred) {
        const cr = credit(slug);
        prefCredit += cr;
        if (cr > 0) matchedSkills.push(slug);
        else missingPreferredSkills.push(slug);
      }
      // One weighted coverage: nice-to-haves count a quarter as much as key skills.
      const effective = (w: number) => (w <= 8 ? w : 8 + (w - 8) * 0.5);
      const PREF = 0.25;
      let ratio =
        reqWeight > 0
          ? Math.min(1, (reqCredit + PREF * prefCredit) / (effective(reqWeight) + PREF * effective(preferred.size)))
          : 0.1 + 0.8 * Math.min(1, prefCredit / Math.max(1, effective(preferred.size)));
      if (missingCoreSkills.length) ratio *= 0.5;
      skillRatio = ratio;
      const points = Math.round(max * ratio);
      const status = ratio >= 0.75 ? "met" : ratio >= 0.4 ? "partial" : "missing";
      const reqMatched = [...required.keys()].filter((s) => credit(s) > 0).length;
      const detail =
        required.size > 0
          ? `You match ${reqMatched} of ${required.size} key skills${matchedSkills.length ? ` (${list(matchedSkills.map(skillDisplayName))})` : ""}.`
          : `You match ${matchedSkills.length} of ${preferred.size} skills mentioned.`;
      components.push({ key: "skills", label: "Skills", points, max, status, detail });
      if (matchedSkills.length) reasons.push(`Skills match: ${list(matchedSkills.map(skillDisplayName))}`);
      if (missingCoreSkills.length) gaps.push(`Core skill for this role: ${list(missingCoreSkills.map(skillDisplayName))}`);
      const otherMissing = missingRequiredSkills.filter((s) => !missingCoreSkills.includes(s));
      if (otherMissing.length) gaps.push(`Missing key skills: ${list(otherMissing.map(skillDisplayName))}`);
      if (missingPreferredSkills.length) gaps.push(`Nice-to-have skills you haven't listed: ${list(missingPreferredSkills.map(skillDisplayName), 3)}`);
    }
  }

  // ---- Role relevance -----------------------------------------------------
  {
    const max = WEIGHTS.role;
    const jobFamilies = roleFamiliesForTitle(job.title);
    const famScore = familySimilarity(c.families, jobFamilies);
    const jobTokens = tokens(job.normalizedTitle || job.title).filter((t) => !["senior", "junior", "lead", "staff", "principal", "remote", "ii", "iii"].includes(t));
    const titleScore = Math.max(0, ...c.titleTokens.map((t) => jaccard(t, jobTokens)));
    const s = Math.max(famScore, Math.min(1, titleScore * 1.5));
    if (c.families.length === 0 && c.titleTokens.length === 0) {
      components.push({ key: "role", label: "Relevant experience", points: Math.round(max * 0.4), max, status: "unknown", detail: "Add your work history to compare it with this role." });
      uncertain.push("No work history in your profile yet.");
    } else {
      const points = Math.round(max * (s === 0 ? 0.1 : s));
      const status = s >= 0.85 ? "met" : s >= 0.5 ? "partial" : "missing";
      const detail =
        status === "met"
          ? "Your recent roles are in the same field as this job."
          : status === "partial"
            ? "Your experience is in a related field."
            : "This role is outside the fields in your work history.";
      components.push({ key: "role", label: "Relevant experience", points, max, status, detail });
      if (status === "met") reasons.push("Your recent experience is directly relevant");
      if (status === "missing" && jobFamilies.length > 0 && famScore === 0) {
        differentField = true;
        gaps.push("Different field from your work history, so it's ranked lower");
      } else if (status === "missing") gaps.push("Your work history is in a different field");
    }
  }

  // ---- Seniority & years --------------------------------------------------
  {
    const max = WEIGHTS.seniority;
    const yearsReq = job.requirements
      .filter((r) => r.kind === "experience" && r.minYears)
      .reduce<number | null>((m, r) => Math.max(m ?? 0, r.minYears!), null);
    const parts: number[] = [];
    const notes: string[] = [];

    if (yearsReq != null) {
      if (c.years == null) {
        uncertain.push(`Asks for ${yearsReq}+ years of experience; add your experience dates to compare.`);
        parts.push(0.5);
      } else if (c.years >= yearsReq) {
        parts.push(1);
        notes.push(`You have ~${fmtYears(c.years)} years; the role asks for ${yearsReq}+.`);
      } else if (c.years >= yearsReq - 1) {
        parts.push(0.75);
        notes.push(`Slightly under the ${yearsReq}+ years asked (you have ~${fmtYears(c.years)}).`);
        gaps.push(`Asks for ${yearsReq}+ years; you have ~${fmtYears(c.years)}`);
      } else if (c.years >= yearsReq * 0.6) {
        parts.push(0.4);
        notes.push(`Asks for ${yearsReq}+ years; you have ~${fmtYears(c.years)}.`);
        gaps.push(`Asks for ${yearsReq}+ years; you have ~${fmtYears(c.years)}`);
      } else {
        parts.push(0.1);
        notes.push(`Asks for ${yearsReq}+ years; you have ~${fmtYears(c.years)}.`);
        gaps.push(`Well below the ${yearsReq}+ years of experience asked`);
      }
    }

    if (job.seniority !== "unknown" && c.level !== "unknown") {
      const diff = SENIORITY_ORDER.indexOf(c.level) - SENIORITY_ORDER.indexOf(job.seniority);
      if (diff === 0) {
        parts.push(1);
        notes.push(`The ${SENIORITY_LABEL[job.seniority]} level matches yours.`);
      } else if (diff === 1) {
        parts.push(0.85);
      } else if (diff >= 2) {
        parts.push(0.6);
        notes.push(`This is a ${SENIORITY_LABEL[job.seniority]} role; you may be overqualified.`);
        uncertain.push("You may be overqualified for this level");
      } else if (diff === -1) {
        parts.push(0.6);
        notes.push(`This is a ${SENIORITY_LABEL[job.seniority]} role, one step above your current level.`);
        gaps.push(`A step up from your current level (${SENIORITY_LABEL[c.level]} → ${SENIORITY_LABEL[job.seniority]})`);
      } else {
        parts.push(0.2);
        notes.push(`This is a ${SENIORITY_LABEL[job.seniority]} role, well above your current level.`);
        gaps.push(`Seniority gap: ${SENIORITY_LABEL[c.level]} → ${SENIORITY_LABEL[job.seniority]}`);
      }
    }

    if (parts.length === 0) {
      components.push({ key: "seniority", label: "Seniority & years", points: Math.round(max * 0.6), max, status: "unknown", detail: "The listing doesn't state a level or years of experience." });
    } else {
      const s = parts.reduce((a, b) => a + b, 0) / parts.length;
      const status = s >= 0.85 ? "met" : s >= 0.5 ? "partial" : "missing";
      components.push({ key: "seniority", label: "Seniority & years", points: Math.round(max * s), max, status, detail: notes.join(" ") || "Level looks compatible." });
      if (status === "met" && yearsReq != null) reasons.push(`Meets the ${yearsReq}+ years of experience asked`);
    }
  }

  // ---- Education & certifications ----------------------------------------
  {
    const max = WEIGHTS.education;
    const eduReqs = job.requirements.filter((r) => r.kind === "education" && r.normalized);
    const certReqs = job.requirements.filter((r) => r.kind === "certification");
    let s = 1;
    let status: ComponentScore["status"] = "met";
    let detail = "No degree requirement stated.";
    const required = eduReqs.filter((r) => r.importance === "required");
    const relevant = required.length ? required : eduReqs;
    if (relevant.length) {
      const needed = relevant
        .map((r) => r.normalized as EducationLevel)
        .reduce((a, b) => (EDUCATION_ORDER.indexOf(b) > EDUCATION_ORDER.indexOf(a) ? b : a));
      const isRequired = required.length > 0;
      if (!c.educationLevel) {
        s = 0.5;
        status = "unknown";
        detail = `${isRequired ? "Requires" : "Prefers"} a ${needed} degree; your education isn't in your profile.`;
        uncertain.push(`Education: the role ${isRequired ? "requires" : "prefers"} a ${needed} degree`);
      } else if (EDUCATION_ORDER.indexOf(c.educationLevel) >= EDUCATION_ORDER.indexOf(needed)) {
        detail = `${isRequired ? "Requires" : "Prefers"} a ${needed} degree; you have one.`;
        reasons.push(`Meets the ${needed} degree requirement`);
      } else if (!isRequired) {
        s = 0.7;
        status = "partial";
        detail = `Prefers a ${needed} degree or equivalent experience.`;
      } else {
        s = 0.3;
        status = "missing";
        detail = `Requires a ${needed} degree.`;
        gaps.push(`Requires a ${needed} degree`);
      }
    }
    for (const cert of certReqs) {
      const has = c.certifications.some((x) => x.includes(cert.normalized ?? cert.text.toLowerCase()));
      if (has) reasons.push(`Holds ${cert.text}`);
      else if (cert.importance === "required") {
        s = Math.max(0, s - 0.3);
        status = "partial";
        gaps.push(`Certification asked: ${cert.text}`);
      }
    }
    components.push({ key: "education", label: "Education & certifications", points: Math.round(max * s), max, status, detail });
  }

  // ---- Location / remote --------------------------------------------------
  {
    const max = WEIGHTS.location;
    const pref = c.raw.remotePreference;
    let s = 0.5;
    let status: ComponentScore["status"] = "unknown";
    let detail = "Work location not stated.";
    if (job.remoteType === "remote") {
      const elig = remoteEligibility(job.remoteRegions, c.countries);
      if (elig === "eligible") {
        s = 1;
        status = "met";
        detail = job.remoteRegions.includes("WORLDWIDE") ? "Fully remote, open worldwide." : `Remote, open to candidates in ${regionsLabel(job.remoteRegions)}.`;
        reasons.push(job.remoteRegions.includes("WORLDWIDE") ? "Remote and open worldwide" : `Remote role you're eligible for (${regionsLabel(job.remoteRegions)})`);
      } else if (elig === "unknown") {
        s = 0.6;
        detail =
          c.countries.length === 0
            ? "Remote. Add your country to check eligibility."
            : "Remote, but the listing doesn't say which countries can apply.";
        uncertain.push(c.countries.length === 0 ? "Add your country to your profile to check remote eligibility" : "Remote, but eligible countries aren't stated: check before applying");
      } else {
        s = 0;
        status = "missing";
        detail = `Remote only within ${regionsLabel(job.remoteRegions)}.`;
        disqualifiers.push(`Remote role limited to ${regionsLabel(job.remoteRegions)}; you're based in ${regionsLabel(c.countries.slice(0, 1))}`);
      }
    } else if (job.remoteType === "hybrid" || job.remoteType === "onsite") {
      const where = job.countries.length ? regionsLabel(job.countries) : "the office location";
      const canWorkThere = job.countries.length > 0 && job.countries.some((jc) => c.countries.includes(jc));
      const kind = job.remoteType === "hybrid" ? "Hybrid" : "On-site";
      if (job.countries.length === 0) {
        s = pref === "remote_only" ? 0.2 : 0.5;
        detail = `${kind} role; location country unclear.`;
        uncertain.push(`${kind} role: check the office location`);
      } else if (canWorkThere) {
        s = pref === "remote_only" ? 0.3 : 1;
        status = pref === "remote_only" ? "partial" : "met";
        detail = `${kind} in ${where}.`;
        if (pref === "remote_only") gaps.push(`${kind} role; you prefer remote`);
        else reasons.push(`${kind} in ${where}, where you can work`);
      } else {
        s = 0.05;
        status = "missing";
        detail = `${kind} in ${where}; would need relocation.`;
        if (pref === "remote_only") disqualifiers.push(`${kind} role in ${where}; you're looking for remote work`);
        else gaps.push(`${kind} in ${where}: requires relocation`);
      }
    } else {
      uncertain.push("The listing doesn't say whether the role is remote");
    }
    components.push({ key: "location", label: "Location & remote", points: Math.round(max * s), max, status, detail });
  }

  // ---- Eligibility: work authorisation & language -------------------------
  {
    const max = WEIGHTS.authorization;
    let s = 1;
    let status: ComponentScore["status"] = "met";
    const notes: string[] = [];
    const authReqs = job.requirements.filter((r) => r.kind === "authorization");
    const authorised = c.raw.authorizedCountries;

    for (const r of authReqs) {
      if (r.normalized?.startsWith("authorized:")) {
        const codes = r.normalized.slice("authorized:".length).split(",");
        if (authorised.length === 0) {
          s = Math.min(s, 0.5);
          status = "unknown";
          uncertain.push(`Requires authorisation to work in ${regionsLabel(codes)}; add your work authorisation to your profile`);
        } else if (authorised.some((a) => codes.some((code) => countryInRegion(a, code)))) {
          notes.push(`You're authorised to work in ${regionsLabel(codes)}.`);
        } else {
          s = 0;
          status = "missing";
          disqualifiers.push(`Requires authorisation to work in ${regionsLabel(codes)}`);
        }
      } else if (r.normalized === "no_sponsorship") {
        const jobCountries = [...job.countries, ...job.remoteRegions.filter((x) => x.length === 2)];
        const coveredByAuth = jobCountries.length > 0 && jobCountries.some((jc) => authorised.includes(jc));
        if (coveredByAuth) continue;
        if (c.raw.needsSponsorship === true) {
          s = 0;
          status = "missing";
          disqualifiers.push("Employer doesn't offer visa sponsorship, and you need it");
        } else if (c.raw.needsSponsorship == null) {
          s = Math.min(s, 0.6);
          if (status === "met") status = "unknown";
          uncertain.push("No visa sponsorship offered; confirm you can work there without it");
        }
      } else if (r.normalized === "sponsorship_available" && c.raw.needsSponsorship) {
        reasons.push("Visa sponsorship is offered");
      }
    }

    for (const r of job.requirements.filter((x) => x.kind === "language" && x.importance === "required")) {
      const lang = (r.normalized ?? "").toLowerCase();
      if (!lang) continue;
      if (c.languages.size === 0) {
        if (lang !== "english") {
          s = Math.min(s, 0.5);
          if (status === "met") status = "unknown";
          uncertain.push(`Requires ${cap(lang)}; add the languages you speak to your profile`);
        }
      } else if (!c.languages.has(lang)) {
        s = 0;
        status = "missing";
        disqualifiers.push(`Requires ${cap(lang)}`);
      } else {
        notes.push(`You speak ${cap(lang)}.`);
      }
    }

    const detail = status === "met" ? notes.join(" ") || "No work-authorisation or language restrictions stated." : status === "missing" ? "There's a hard requirement you don't meet." : "Some eligibility details need checking.";
    components.push({ key: "authorization", label: "Eligibility (authorisation & language)", points: Math.round(max * s), max, status, detail });
  }

  // ---- Industry / domain --------------------------------------------------
  {
    const max = WEIGHTS.domain;
    const jobIndustries = job.domainText ? detectIndustries(job.domainText, 2, 2) : [];
    let s = 0.6;
    let status: ComponentScore["status"] = "unknown";
    let detail = "Industry not clear from the listing.";
    if (jobIndustries.length && c.industries.size) {
      const overlap = jobIndustries.filter((i) => c.industries.has(i));
      if (overlap.length) {
        s = 1;
        status = "met";
        detail = `You have ${INDUSTRY_LABEL.get(overlap[0])} experience.`;
        reasons.push(`Industry experience: ${INDUSTRY_LABEL.get(overlap[0])}`);
      } else {
        s = 0.4;
        status = "partial";
        detail = `New industry for you: ${INDUSTRY_LABEL.get(jobIndustries[0])}.`;
      }
    } else if (jobIndustries.length) {
      detail = `${INDUSTRY_LABEL.get(jobIndustries[0])}. Add industries to your profile to compare.`;
    }
    components.push({ key: "domain", label: "Industry & domain", points: Math.round(max * s), max, status, detail });
  }

  // ---- Total --------------------------------------------------------------
  let score = components.reduce((sum, x) => sum + x.points, 0);
  if (disqualifiers.length && score > DISQUALIFIED_CAP) {
    score = DISQUALIFIED_CAP;
    adjustments.push(`Capped at ${DISQUALIFIED_CAP} because of a hard requirement you don't meet.`);
  }
  if (differentField && score > DIFFERENT_FIELD_CAP) {
    score = DIFFERENT_FIELD_CAP;
    adjustments.push(`Capped at ${DIFFERENT_FIELD_CAP} because the role is in a different field from your experience.`);
  }
  if (skillRatio != null && skillRatio < STRONG_MIN_SKILL_RATIO && score >= matching.strongThreshold) {
    score = matching.strongThreshold - 1;
    adjustments.push("Not marked as a strong match because you have fewer than 60% of the key skills.");
  }
  score = Math.max(0, Math.min(100, score));
  const band = score >= matching.strongThreshold ? "high" : score >= matching.possibleThreshold ? "possible" : "low";
  const label = disqualifiers.length ? "Not eligible" : band === "high" ? "Strong match" : band === "possible" ? "Possible match" : "Low fit";

  return {
    score,
    band,
    label,
    components,
    reasons: reasons.slice(0, 5),
    gaps: gaps.slice(0, 6),
    disqualifiers,
    uncertain: uncertain.slice(0, 4),
    adjustments,
    matchedSkills,
    missingRequiredSkills,
    missingPreferredSkills,
    engineVersion: ENGINE_VERSION,
  };
}

function fmtYears(y: number) {
  return Number.isInteger(y) ? String(y) : y.toFixed(1);
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Total years of professional experience from dated roles, merging overlaps. */
export function yearsFromExperiences(
  exps: { startDate?: string | null; endDate?: string | null; isCurrent?: boolean }[],
  now = new Date(),
): number | null {
  const ranges = exps
    .filter((e) => e.startDate)
    .map((e) => {
      const start = new Date(e.startDate!).getTime();
      const end = e.isCurrent || !e.endDate ? now.getTime() : new Date(e.endDate).getTime();
      return [start, Math.max(start, end)] as [number, number];
    })
    .filter(([s, e]) => Number.isFinite(s) && Number.isFinite(e))
    .sort((a, b) => a[0] - b[0]);
  if (ranges.length === 0) return null;
  let total = 0;
  let [curS, curE] = ranges[0];
  for (const [s, e] of ranges.slice(1)) {
    if (s <= curE) curE = Math.max(curE, e);
    else {
      total += curE - curS;
      [curS, curE] = [s, e];
    }
  }
  total += curE - curS;
  return Math.round((total / (365.25 * 86_400_000)) * 10) / 10;
}
