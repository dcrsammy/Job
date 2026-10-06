// Fabrication guard for generated application materials.
// The resume structure (employers, titles, dates, education) is always
// rendered from the candidate's verified facts, never from model text. Free
// text (bullets, summary, cover letter, answers) is checked for numbers and
// skills that don't appear in the candidate's own material.
import { findSkills, IMPLIES, skillDisplayName } from "../skills/taxonomy";

export interface FactSource {
  /** All text the candidate has supplied (resume text + profile edits). */
  sourceText: string;
  candidateSkills: Set<string>;
  yearsExperience: number | null;
}

export interface GuardWarning {
  where: string;
  message: string;
}

const NUMBER_RE = /(?<![A-Za-z])(\$|€|£|₦)?\d[\d,.]*\s*(%|k|m|x|\+)?(?![A-Za-z])/gi;

/** Numbers like "40%", "$2M", "10x" that do not occur in the source. */
export function unsupportedNumbers(text: string, source: string): string[] {
  const src = source.replace(/,/g, "").toLowerCase();
  const out: string[] = [];
  for (const m of text.matchAll(NUMBER_RE)) {
    const raw = m[0].trim();
    const digits = raw.replace(/[^\d.]/g, "").replace(/\.$/, "");
    if (!digits || digits.length === 0) continue;
    // years like 2019 and small ordinals are fine if they're in the source; everything is checked the same way
    if (!src.includes(digits)) out.push(raw);
  }
  return Array.from(new Set(out));
}

/** Skills mentioned in text that the candidate doesn't have (directly or implied). */
export function unsupportedSkills(text: string, candidateSkills: Set<string>): string[] {
  const implied = new Set<string>(candidateSkills);
  for (const s of candidateSkills) for (const i of IMPLIES[s] ?? []) implied.add(i);
  return findSkills(text).filter((s) => !implied.has(s));
}

/** Claims like "8+ years of experience" that exceed the candidate's real experience. */
export function inflatedYears(text: string, years: number | null): string[] {
  if (years == null) return [];
  const out: string[] = [];
  for (const m of text.matchAll(/(\d{1,2})\+?\s*(years?|yrs?)(\s+of)?\s+(professional\s+|industry\s+|hands-on\s+)?experience/gi)) {
    if (parseInt(m[1], 10) > Math.ceil(years + 0.5)) out.push(m[0]);
  }
  return out;
}

export function checkText(where: string, text: string, facts: FactSource): GuardWarning[] {
  const warnings: GuardWarning[] = [];
  const nums = unsupportedNumbers(text, facts.sourceText);
  if (nums.length) warnings.push({ where, message: `Contains figures not found in your resume: ${nums.join(", ")}. Check they're accurate or remove them.` });
  const skills = unsupportedSkills(text, facts.candidateSkills);
  if (skills.length) warnings.push({ where, message: `Mentions skills not in your profile: ${skills.map(skillDisplayName).join(", ")}. Remove them unless you really have them.` });
  const yrs = inflatedYears(text, facts.yearsExperience);
  if (yrs.length) warnings.push({ where, message: `Claims more experience than your profile shows ("${yrs[0]}").` });
  return warnings;
}
