// Rule-based resume parser. Used when no AI provider is configured and as a
// cross-check. Everything it returns is marked "extracted" with the source
// line as evidence, so users can see exactly where each item came from.
import { findCountries } from "../geo";
import { extractEducation, seniorityFromYears } from "../jobs/requirements";
import { yearsFromExperiences } from "../matching/engine";
import { detectIndustries } from "../matching/industries";
import { roleFamiliesForTitle } from "../matching/role-families";
import { findSkills, skillDisplayName } from "../skills/taxonomy";
import type { CandidateEducation, CandidateExperience, ParsedResume } from "../types";

const SECTION_HEADINGS: [RegExp, string][] = [
  [/^(professional |work |employment |career )?(experience|history)$|^work experience$|^employment$|^experience$/i, "experience"],
  [/^(education|academic background|academics|education & training|education and training)$/i, "education"],
  [/^(technical |core |key )?(skills|competencies|technologies|tech stack|tools|expertise|skills & tools|skills and tools)$/i, "skills"],
  [/^(certifications?|licenses?( & certifications?)?|certificates?|courses|training)$/i, "certifications"],
  [/^(summary|profile|professional summary|about( me)?|objective|career objective)$/i, "summary"],
  [/^(projects?|selected projects|personal projects|portfolio)$/i, "projects"],
  [/^(languages?)$/i, "languages"],
  [/^(references|interests|hobbies|awards|publications|volunteering|volunteer experience)$/i, "other"],
];

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

const DATE_TOKEN = "(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?\\s+\\d{4}|\\d{1,2}[/.]\\d{4}|\\d{4})";
const RANGE_RE = new RegExp(`(${DATE_TOKEN})\\s*(?:-|–|—|to|until)\\s*(${DATE_TOKEN}|present|current|now|today|ongoing)`, "i");

export function parseDateToken(token: string): string | null {
  const t = token.trim().toLowerCase();
  let m = t.match(/^([a-z]+)\.?\s+(\d{4})$/);
  if (m && MONTHS[m[1].slice(0, 3)]) return `${m[2]}-${String(MONTHS[m[1].slice(0, 3)]).padStart(2, "0")}-01`;
  m = t.match(/^(\d{1,2})[/.](\d{4})$/);
  if (m) return `${m[2]}-${m[1].padStart(2, "0")}-01`;
  m = t.match(/^(\d{4})$/);
  if (m) return `${m[1]}-01-01`;
  return null;
}

function sectionOf(line: string): string | null {
  const clean = line.replace(/[:|•\-–_=*#]+/g, " ").replace(/\s+/g, " ").trim();
  if (clean.length > 40) return null;
  for (const [re, name] of SECTION_HEADINGS) if (re.test(clean)) return name;
  return null;
}

const LANGUAGE_NAMES = ["English", "Yoruba", "Igbo", "Hausa", "French", "German", "Spanish", "Portuguese", "Arabic", "Mandarin", "Chinese", "Swahili", "Dutch", "Italian", "Japanese", "Korean", "Hindi", "Russian", "Polish", "Turkish"];

export function parseResumeHeuristically(raw: string, now = new Date()): ParsedResume {
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  const sections: Record<string, string[]> = { header: [] };
  let current = "header";
  for (const line of lines) {
    const s = sectionOf(line);
    if (s) {
      current = s;
      sections[current] ??= [];
      continue;
    }
    (sections[current] ??= []).push(line);
  }

  // Contact
  const email = raw.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0];
  const phone = raw.match(/(\+?\d[\d\s().-]{7,}\d)/)?.[0]?.trim();
  const withoutEmails = raw.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, " ");
  const links = Array.from(new Set(withoutEmails.match(/\b(?:https?:\/\/)?(?:www\.)?(?:linkedin\.com|github\.com|[a-z0-9-]+\.(?:dev|io|com|me|app))\/?[\w\-./~%]*/gi) ?? []))
    .filter((l) => !l.includes("@"))
    .slice(0, 5);
  const header = sections.header ?? [];
  const nameLine = header.find((l) => /^[A-Za-z][A-Za-z'.-]+(\s+[A-Za-z][A-Za-z'.-]+){1,3}$/.test(l) && l.length < 40);
  const headlineLine = header.find((l) => l !== nameLine && !l.includes("@") && !/\d{5,}/.test(l) && l.length > 5 && l.length < 90 && roleFamiliesForTitle(l).length > 0);
  const locationLine = header.find((l) => findCountries(l).length > 0) ?? null;
  // "Lagos, Nigeria · me@x.com · github.com/me" → "Lagos, Nigeria"
  const location = locationLine
    ? locationLine
        .split(/\s*[·|•]\s*/)
        .filter((seg) => findCountries(seg).length > 0 && !seg.includes("@"))
        .join(", ") || null
    : null;

  // Experience: anchor on lines with a date range.
  const experiences: CandidateExperience[] = [];
  const expLines = [...(sections.experience ?? [])];
  for (let i = 0; i < expLines.length; i++) {
    const line = expLines[i];
    const m = line.match(RANGE_RE);
    if (!m) continue;
    const startDate = parseDateToken(m[1]);
    const isCurrent = /present|current|now|today|ongoing/i.test(m[2]);
    const endDate = isCurrent ? null : parseDateToken(m[2]);
    const sameLine = line.replace(m[0], "").replace(/[|,–—-]+\s*$/, "").replace(/^\s*[|,–—-]+/, "").trim();
    const prev = expLines[i - 1] && !RANGE_RE.test(expLines[i - 1]) && !/^[-•*▪●]/.test(expLines[i - 1]) ? expLines[i - 1] : "";
    const next = expLines[i + 1] && !RANGE_RE.test(expLines[i + 1]) && !/^[-•*▪●]/.test(expLines[i + 1]) ? expLines[i + 1] : "";
    const titleCandidates = [sameLine, prev, next].filter(Boolean);
    const split = (s: string) => s.split(/\s+(?:at|@|\||–|—|-)\s+|,\s+/);
    let title = "";
    let employer = "";
    for (const c of titleCandidates) {
      const parts = split(c);
      const t = parts.find((p) => roleFamiliesForTitle(p).length > 0);
      if (t && !title) {
        title = t.trim();
        const other = parts.find((p) => p !== t);
        if (other && !employer) employer = other.trim();
      } else if (!employer && c !== title) {
        employer = parts[0].trim();
      }
    }
    if (!title) title = titleCandidates[0] ?? "Role";
    if (!employer) employer = titleCandidates.find((c) => c !== title) ?? "Unknown employer";

    const highlights: string[] = [];
    for (let j = i + 1; j < expLines.length && !RANGE_RE.test(expLines[j]); j++) {
      if (/^[-•*▪●◦]/.test(expLines[j])) highlights.push(expLines[j].replace(/^[-•*▪●◦]\s*/, ""));
    }
    const block = [title, employer, ...highlights].join("\n");
    experiences.push({
      employer: employer.slice(0, 120),
      title: title.slice(0, 120),
      startDate,
      endDate,
      isCurrent,
      highlights: highlights.slice(0, 12),
      skills: findSkills(block).map(skillDisplayName),
      provenance: "extracted",
      evidence: [prev, line].filter(Boolean).join(" · ").slice(0, 300),
    });
  }

  // Education & certifications
  const educations: CandidateEducation[] = [];
  for (const line of sections.education ?? []) {
    const edu = extractEducation(line);
    if (!edu && !/(university|college|institute|school|polytechnic)/i.test(line)) continue;
    const range = line.match(RANGE_RE) ?? line.match(/\b(19|20)\d{2}\b/);
    educations.push({
      kind: "degree",
      institution: (line.match(/[^,|–—-]*(university|college|institute|school|polytechnic)[^,|–—-]*/i)?.[0] ?? line).trim().slice(0, 150),
      qualification: line.slice(0, 150),
      level: edu?.level ?? null,
      endDate: range ? parseDateToken(Array.isArray(range) && range[2] && !/present/i.test(range[2]) ? range[2] : range[0].slice(-4)) : null,
      provenance: "extracted",
      evidence: line.slice(0, 300),
    });
  }
  for (const line of sections.certifications ?? []) {
    if (line.length < 4) continue;
    educations.push({
      kind: "certification",
      institution: line.split(/[,|–—-]/).slice(1).join(" ").trim() || "—",
      qualification: line.split(/[,|–—-]/)[0].trim().slice(0, 150),
      provenance: "extracted",
      evidence: line.slice(0, 300),
    });
  }

  // Skills: everything recognised in the skills section, plus mentions elsewhere.
  const skillSection = (sections.skills ?? []).join("\n");
  const skillSlugs = new Set([...findSkills(skillSection), ...findSkills(raw)]);
  const skills = [...skillSlugs].map((slug) => {
    const name = skillDisplayName(slug);
    const evidenceLine = lines.find((l) => findSkills(l).includes(slug));
    return { name, normalized: slug, provenance: "extracted" as const, evidence: evidenceLine?.slice(0, 200) ?? null };
  });

  const languages = LANGUAGE_NAMES.filter((l) => new RegExp(`\\b${l}\\b`).test((sections.languages ?? []).join(" ") || raw)).map((l) => l.toLowerCase());

  const years = yearsFromExperiences(experiences, now);
  const families = Array.from(new Set(experiences.slice(0, 3).flatMap((e) => roleFamiliesForTitle(e.title))));
  // Industries come from what the person worked on, not headings like "Education".
  const workText = experiences.map((e) => [e.title, e.employer, ...e.highlights].join(" ")).join("\n");
  const industries = detectIndustries(workText, 1, 3);
  const baseCountry = locationLine ? findCountries(locationLine)[0] : null;

  const missing: string[] = [];
  if (experiences.length === 0) missing.push("Work history (employer, title and dates for each role)");
  if (educations.filter((e) => e.kind === "degree").length === 0) missing.push("Education");
  if (!baseCountry) missing.push("The country you're based in");
  missing.push("Countries where you're authorised to work, and whether you need visa sponsorship");

  const summaryText = (sections.summary ?? []).join(" ").trim();

  return {
    fullName: nameLine ? { value: nameLine, provenance: "extracted", evidence: nameLine } : null,
    headline: headlineLine ? { value: headlineLine, provenance: "extracted", evidence: headlineLine } : null,
    summary: summaryText ? { value: summaryText.slice(0, 1200), provenance: "extracted", evidence: summaryText.slice(0, 200) } : null,
    contact: { email, phone, location: location ?? undefined, links },
    skills,
    experiences,
    educations,
    languages,
    yearsExperience: years != null ? { value: years, provenance: "inferred", evidence: "Calculated from the dates of your roles" } : null,
    seniority: years != null ? { value: seniorityFromYears(years), provenance: "inferred", evidence: "Estimated from your years of experience" } : null,
    roleFamilies: families.length ? { value: families, provenance: "inferred", evidence: "Based on your job titles" } : null,
    industries: industries.length ? { value: industries, provenance: "inferred", evidence: "Based on words used in your resume" } : null,
    baseCountry: baseCountry ? { value: baseCountry, provenance: "extracted", evidence: locationLine } : null,
    missing,
    parser: "heuristic",
  };
}
