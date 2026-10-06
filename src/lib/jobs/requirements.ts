// Heuristic requirement extraction from job descriptions. Runs on every
// ingested job (cheap, deterministic). The AI-based extractor in
// ../ai/job-analysis.ts can refine a single job on demand.
import { findSkills, skillDisplayName, SKILL_BY_SLUG } from "../skills/taxonomy";
import { findCountries, findRegions } from "../geo";
import type { EducationLevel, JobRequirement, Seniority } from "../types";

type Section = "context" | "required" | "preferred" | "duties" | "benefits";

const HEADING_RULES: [RegExp, Section][] = [
  [/(nice[- ]to[- ]haves?|bonus( points)?|preferred|pluses|a plus|would be great|extra credit|it'?s a plus|good to have|desirable|stand out|even better)/i, "preferred"],
  [/(requirements?|qualifications?|what you('|’)?ll (need|bring)|what we('|’)?re looking for|who you are|you (have|bring|are|might be)|about you|must[- ]haves?|skills|experience|you should have|we('|’)?d love|your background|what you bring|ideal candidate|minimum)/i, "required"],
  [/(responsibilities|what you('|’)?ll do|the role|your role|day[- ]to[- ]day|you will|in this role|your impact|what you will be doing)/i, "duties"],
  [/(benefits|perks|what we offer|compensation|salary|why join|we offer|our offer|equal opportunity|eeo|accommodation)/i, "benefits"],
  [/(about (us|the company|the team)|who we are|our mission|company overview)/i, "context"],
];

function classifyHeading(line: string): Section | null {
  // List items are content, never headings.
  if (/^\s*([-•*▪●◦·]|\d+[.)])\s+/.test(line)) return null;
  const clean = line.replace(/^[-•*#\s]+/, "").replace(/[:\s]+$/, "");
  // Headings are short and not sentences.
  if (clean.length === 0 || clean.length > 70) return null;
  if (/[.!?]$/.test(line.trim()) && clean.split(" ").length > 6) return null;
  for (const [re, section] of HEADING_RULES) if (re.test(clean)) return section;
  return null;
}

const PREFERRED_LINE = /(nice to have|is a plus|a plus\b|bonus|preferred|ideally|desirable|familiarity with|exposure to|would be great|helpful|advantage)/i;
const REQUIRED_LINE = /(must|required|requirement|minimum|at least|proven|strong|solid|expert|proficien|deep (knowledge|experience))/i;

const YEARS_RE =
  /(\d{1,2})\s*(?:\+|plus)?\s*(?:(?:-|–|to)\s*(\d{1,2})\s*)?\+?\s*(?:years?|yrs?)(?:['’]s?)?\b(?:\s+of)?(?:[^.\n]{0,60})?\b(experience|exp\b|background|track record|working|building|in\b|with\b|as\b|developing|leading|managing|professional)/i;

export function extractMinYears(line: string): number | null {
  const m = line.match(YEARS_RE);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n) || n < 1 || n > 25) return null;
  return n;
}

const EDUCATION_PATTERNS: [RegExp, EducationLevel][] = [
  [/\b(ph\.?d|doctorate|doctoral)\b/i, "doctorate"],
  [/\b(master'?s|msc|m\.s\.|mba|ms degree|ma degree|graduate degree)\b/i, "master"],
  [/\b(bachelor'?s|b\.?sc|b\.s\.|b\.a\.|ba\/bs|bs\/ba|bs\/ms|undergraduate degree|university degree|college degree|4[- ]year degree|degree in)\b/i, "bachelor"],
  [/\b(associate'?s degree)\b/i, "associate"],
];

export function extractEducation(line: string): { level: EducationLevel; orEquivalent: boolean } | null {
  for (const [re, level] of EDUCATION_PATTERNS) {
    if (re.test(line)) {
      return {
        level,
        orEquivalent: /(or equivalent|equivalent (practical |work )?experience|or related experience|or similar experience|or relevant experience)/i.test(line),
      };
    }
  }
  return null;
}

const CERT_RE = /\b(AWS Certified[\w\s-]{0,40}|CISSP|CISM|CISA|CPA|ACCA|CFA|PMP|CKA|CKAD|Security\+|CompTIA[\w\s+]{0,20}|Google Cloud Certified[\w\s-]{0,30}|Azure (?:Fundamentals|Administrator|Solutions Architect)[\w\s-]{0,20}|Scrum Master|CSM|PSM|ITIL|SHRM-?CP|CIPD)\b/g;

const NO_SPONSOR_RE =
  /(not (able|able to|in a position to) (to )?(offer|provide|support) (visa |work )?sponsorship|unable to (offer|provide|support) (visa |work )?sponsorship|(do|does|will) not (offer|provide|sponsor)[^.]{0,30}sponsorship|without (the need for )?(current or future )?(visa |employment )?sponsorship|no (visa )?sponsorship)/i;
const SPONSOR_RE = /(visa sponsorship (is )?(available|provided|offered)|(we|will) (can )?sponsor (visas?|work permits?)|relocation and visa support|sponsorship available)/i;
const AUTH_RE =
  /(must|should|need to|required to) (be )?(legally )?(authori[sz]ed|eligible|permitted|able) to work in ([^.;\n]{2,60})/i;
const BASED_RE =
  /(must|should|need to|required to) (be )?(currently )?(based|located|reside|residing|live|living) in ([^.;\n]{2,60})|(open|available) (only )?to (candidates|applicants|people) (based |located |residing )?in ([^.;\n]{2,60})|\b(US|U\.S\.|UK|EU|EMEA|LATAM|APAC|Canada|Europe)[- ]based (candidates|applicants|only)/i;

const LANGUAGE_RE =
  /\b(fluen(t|cy)|native|proficien(t|cy)|business[- ]level|professional working)\b[^.\n]{0,30}\b(English|German|French|Spanish|Portuguese|Dutch|Italian|Japanese|Mandarin|Chinese|Korean|Arabic|Polish|Swedish|Hindi)\b|\b(English|German|French|Spanish|Portuguese|Dutch|Italian|Japanese|Mandarin|Chinese|Korean|Arabic|Polish|Swedish|Hindi)\b[^.\n]{0,20}\b(fluen(t|cy)|native|C1|C2|B2|required|is a must|mandatory)\b/i;

export interface ExtractOptions {
  /** Employer name; skills equal to the employer's own product are ignored (e.g. "Notion" at Notion). */
  employerName?: string;
  /** Tags supplied by the source (aggregators), treated as preferred skills. */
  tags?: string[];
}

export function extractRequirements(description: string, opts: ExtractOptions = {}): JobRequirement[] {
  const lines = description.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  let section: Section = "context";
  const skillImportance = new Map<string, "required" | "preferred">();
  const reqs: JobRequirement[] = [];
  const seen = new Set<string>();
  const employer = (opts.employerName ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

  const add = (r: JobRequirement) => {
    const key = `${r.kind}:${r.normalized ?? r.text}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    reqs.push({ extractedBy: "heuristic", ...r });
  };

  let maxYears: { years: number; text: string; importance: "required" | "preferred" } | null = null;

  for (const line of lines) {
    const heading = classifyHeading(line);
    if (heading) {
      section = heading;
      continue;
    }
    if (section === "benefits") continue;

    const linePreferred = PREFERRED_LINE.test(line) && !/\b(must|required)\b/i.test(line);
    const importance: "required" | "preferred" =
      section === "preferred" || linePreferred ? "preferred" : section === "required" ? "required" : REQUIRED_LINE.test(line) && section !== "context" ? "required" : "preferred";

    // Skills
    for (const slug of findSkills(line)) {
      const skill = SKILL_BY_SLUG.get(slug);
      if (skill && employer && skill.aliases.some((a) => a.replace(/[^a-z0-9]/g, "") === employer)) continue;
      // Skills only mentioned in company context, and everyday tools, are weaker signals.
      const imp = section === "context" || skill?.category === "tools" ? "preferred" : importance;
      const prev = skillImportance.get(slug);
      if (!prev || (prev === "preferred" && imp === "required")) skillImportance.set(slug, imp);
    }

    // Years of experience
    if (section !== "context" && section !== "duties") {
      const years = extractMinYears(line);
      if (years !== null && (!maxYears || years > maxYears.years)) {
        maxYears = { years, text: line, importance };
      }
    }

    // Education
    if (section !== "context") {
      const edu = extractEducation(line);
      if (edu) {
        add({
          kind: "education",
          text: line.slice(0, 300),
          normalized: edu.level,
          importance: edu.orEquivalent || importance === "preferred" ? "preferred" : "required",
        });
      }
    }

    // Certifications
    for (const m of line.matchAll(CERT_RE)) {
      add({ kind: "certification", text: m[0].trim(), normalized: m[0].trim().toLowerCase(), importance });
    }

    // Work authorization
    if (NO_SPONSOR_RE.test(line)) {
      add({ kind: "authorization", text: line.slice(0, 300), normalized: "no_sponsorship", importance: "required" });
    } else if (SPONSOR_RE.test(line)) {
      add({ kind: "authorization", text: line.slice(0, 300), normalized: "sponsorship_available", importance: "preferred" });
    }
    const auth = line.match(AUTH_RE);
    if (auth) {
      const where = auth[5];
      const codes = [...findCountries(where), ...findRegions(where).filter((r) => r !== "WORLDWIDE")];
      if (codes.length) {
        add({ kind: "authorization", text: line.slice(0, 300), normalized: `authorized:${codes.join(",")}`, importance: "required" });
      }
    }

    // Location restriction stated in the text
    const based = line.match(BASED_RE);
    if (based) {
      const where = based[0];
      const codes = [...findCountries(where), ...findRegions(where).filter((r) => r !== "WORLDWIDE")];
      if (codes.length) {
        add({ kind: "location", text: line.slice(0, 300), normalized: `based:${codes.join(",")}`, importance: "required" });
      }
    }

    // Spoken languages
    const lang = line.match(LANGUAGE_RE);
    if (lang) {
      const name = (lang[5] ?? lang[6] ?? "").trim();
      if (name && !(name === "English" && /\benglish\b/i.test(line) && importance === "preferred")) {
        add({ kind: "language", text: line.slice(0, 200), normalized: name.toLowerCase(), importance });
      }
    }
  }

  const lang = detectListingLanguage(description);
  if (lang && lang !== "english") {
    add({ kind: "language", text: `Listing is written in ${lang[0].toUpperCase()}${lang.slice(1)}`, normalized: lang, importance: "required" });
  }

  for (const tag of opts.tags ?? []) {
    for (const slug of findSkills(tag)) if (!skillImportance.has(slug)) skillImportance.set(slug, "preferred");
  }

  for (const [slug, importance] of skillImportance) {
    add({ kind: "skill", text: skillDisplayName(slug), normalized: slug, importance });
  }
  if (maxYears) {
    add({
      kind: "experience",
      text: maxYears.text.slice(0, 300),
      normalized: `${maxYears.years}+ years`,
      importance: maxYears.importance,
      minYears: maxYears.years,
    });
  }
  return reqs;
}

// ---------------------------------------------------------------------------
// Title-level signals
// ---------------------------------------------------------------------------
export function seniorityFromTitle(title: string): Seniority {
  const t = title.toLowerCase();
  if (/\b(intern|internship|apprentice|working student|werkstudent)\b/.test(t)) return "intern";
  if (/\b(chief|vp|vice president|head of|director|cto|ceo|cfo|coo|cmo)\b/.test(t)) return "executive";
  if (/\b(principal|distinguished|fellow|architect)\b/.test(t)) return "principal";
  if (/\b(staff|lead|team lead|tech lead|engineering manager|people manager)\b/.test(t)) return "lead";
  if (/\b(senior|sr\.?|iii|level 3|l5)\b/.test(t)) return "senior";
  if (/\b(junior|jr\.?|entry[- ]level|graduate|new grad|associate|i\b|level 1)\b/.test(t)) return "junior";
  if (/\b(mid[- ]level|intermediate|ii\b|level 2)\b/.test(t)) return "mid";
  return "unknown";
}

export function seniorityFromYears(years: number | null | undefined): Seniority {
  if (years == null) return "unknown";
  if (years < 1) return "intern";
  if (years < 3) return "junior";
  if (years < 6) return "mid";
  if (years < 9) return "senior";
  return "lead";
}

export function employmentTypeFrom(...hints: (string | null | undefined)[]): string | null {
  const t = hints.filter(Boolean).join(" ").toLowerCase();
  if (!t) return null;
  if (/intern/.test(t)) return "internship";
  if (/(contract|freelance|contractor|temporary|temp\b)/.test(t)) return "contract";
  if (/part[- _]?time/.test(t)) return "part_time";
  if (/(full[- _]?time|permanent|fulltime|regular)/.test(t)) return "full_time";
  return null;
}

const LANGUAGE_MARKERS: Record<string, string[]> = {
  german: ["und", "wir", "die", "der", "für", "mit", "sie", "ist", "das", "bei", "auf", "eine"],
  french: ["et", "nous", "les", "des", "pour", "avec", "vous", "une", "dans", "est", "sur"],
  spanish: ["y", "nosotros", "los", "las", "para", "con", "una", "del", "por", "experiencia", "trabajo"],
  portuguese: ["e", "nós", "os", "para", "com", "uma", "você", "experiência", "não", "trabalho"],
  dutch: ["en", "wij", "het", "een", "voor", "met", "je", "van", "jouw", "ervaring"],
  english: ["and", "we", "the", "for", "with", "you", "is", "our", "will", "of", "to"],
};

/** Very small stop-word based language guess for a listing. */
export function detectListingLanguage(text: string): string | null {
  const words = text.toLowerCase().match(/[a-zäöüßéèêàçñãõí]+/g) ?? [];
  if (words.length < 40) return null;
  const sample = words.slice(0, 600);
  let best: [string, number] | null = null;
  for (const [lang, markers] of Object.entries(LANGUAGE_MARKERS)) {
    const set = new Set(markers);
    const hits = sample.filter((w) => set.has(w)).length / sample.length;
    if (!best || hits > best[1]) best = [lang, hits];
  }
  return best && best[1] > 0.04 ? best[0] : null;
}
