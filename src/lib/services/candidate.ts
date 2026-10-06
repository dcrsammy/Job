// Loading and saving the candidate profile.
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeSkillName } from "../skills/taxonomy";
import type {
  CandidateEducation,
  CandidateExperience,
  CandidateForMatch,
  CandidateSkill,
  ParsedResume,
  Provenance,
  RemotePreference,
  Seniority,
} from "../types";
import type { TailorCandidate } from "../tailoring/generate";

export interface CandidateProfileRow {
  id: string;
  user_id: string;
  headline: string | null;
  summary: string | null;
  years_experience: number | null;
  years_experience_provenance: Provenance | null;
  seniority: Seniority;
  seniority_provenance: Provenance | null;
  role_families: string[];
  industries: string[];
  preferred_locations: string[];
  authorized_countries: string[];
  needs_sponsorship: boolean | null;
  remote_preference: RemotePreference;
  base_country: string | null;
  timezone: string | null;
  salary_min: number | null;
  salary_currency: string | null;
  languages: string[];
  contact: { email?: string; phone?: string; location?: string; links?: string[] };
  source_resume_id: string | null;
  confirmed_at: string | null;
  updated_at: string;
}

export interface ExperienceRow {
  id: string;
  employer: string;
  title: string;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
  description: string | null;
  highlights: string[];
  skills: string[];
  provenance: Provenance;
  evidence: string | null;
  sort_order: number;
}

export interface EducationRow {
  id: string;
  kind: "degree" | "certification" | "course";
  institution: string;
  qualification: string | null;
  field: string | null;
  level: CandidateEducation["level"];
  start_date: string | null;
  end_date: string | null;
  provenance: Provenance;
  evidence: string | null;
  sort_order: number;
}

export interface SkillRow {
  id: string;
  name: string;
  normalized: string;
  years: number | null;
  provenance: Provenance;
  evidence: string | null;
}

export interface FullCandidate {
  profile: CandidateProfileRow;
  fullName: string | null;
  skills: SkillRow[];
  experiences: ExperienceRow[];
  educations: EducationRow[];
  resumeText: string;
}

export async function loadCandidate(db: SupabaseClient, userId: string): Promise<FullCandidate | null> {
  const [{ data: profile }, { data: account }, { data: skills }, { data: experiences }, { data: educations }] = await Promise.all([
    db.from("candidate_profiles").select("*").eq("user_id", userId).maybeSingle(),
    db.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
    db.from("candidate_skills").select("id, name, normalized, years, provenance, evidence").eq("user_id", userId).order("created_at"),
    db.from("experiences").select("*").eq("user_id", userId).order("sort_order"),
    db.from("educations").select("*").eq("user_id", userId).order("sort_order"),
  ]);
  if (!profile) return null;
  let resumeText = "";
  if (profile.source_resume_id) {
    const { data: resume } = await db.from("resumes").select("raw_text").eq("id", profile.source_resume_id).eq("user_id", userId).maybeSingle();
    resumeText = resume?.raw_text ?? "";
  }
  return {
    profile: profile as CandidateProfileRow,
    fullName: account?.full_name ?? null,
    skills: (skills ?? []) as SkillRow[],
    experiences: (experiences ?? []) as ExperienceRow[],
    educations: (educations ?? []) as EducationRow[],
    resumeText,
  };
}

function toExperience(e: ExperienceRow): CandidateExperience & { id: string } {
  return {
    id: e.id,
    employer: e.employer,
    title: e.title,
    location: e.location,
    startDate: e.start_date,
    endDate: e.end_date,
    isCurrent: e.is_current,
    description: e.description,
    highlights: e.highlights ?? [],
    skills: e.skills ?? [],
    provenance: e.provenance,
    evidence: e.evidence,
  };
}

function toEducation(e: EducationRow): CandidateEducation & { id: string } {
  return {
    id: e.id,
    kind: e.kind,
    institution: e.institution,
    qualification: e.qualification,
    field: e.field,
    level: e.level,
    startDate: e.start_date,
    endDate: e.end_date,
    provenance: e.provenance,
    evidence: e.evidence,
  };
}

export function toCandidateForMatch(c: FullCandidate): CandidateForMatch {
  const p = c.profile;
  return {
    skills: c.skills.map((s): CandidateSkill => ({ name: s.name, normalized: s.normalized, years: s.years, provenance: s.provenance })),
    experiences: c.experiences.map(toExperience),
    educations: c.educations.map(toEducation),
    yearsExperience: p.years_experience != null ? Number(p.years_experience) : null,
    seniority: p.seniority,
    roleFamilies: p.role_families ?? [],
    industries: p.industries ?? [],
    baseCountry: p.base_country,
    authorizedCountries: p.authorized_countries ?? [],
    needsSponsorship: p.needs_sponsorship,
    remotePreference: p.remote_preference,
    languages: p.languages ?? [],
  };
}

export function toTailorCandidate(c: FullCandidate): TailorCandidate {
  const p = c.profile;
  return {
    fullName: c.fullName,
    headline: p.headline,
    summary: p.summary,
    contact: p.contact ?? {},
    skills: c.skills.map((s) => ({ name: s.name, normalized: s.normalized, provenance: s.provenance })),
    experiences: c.experiences.map(toExperience),
    educations: c.educations.map(toEducation),
    yearsExperience: p.years_experience != null ? Number(p.years_experience) : null,
    baseCountry: p.base_country,
    authorizedCountries: p.authorized_countries ?? [],
    needsSponsorship: p.needs_sponsorship,
    salaryMin: p.salary_min,
    salaryCurrency: p.salary_currency,
    languages: p.languages ?? [],
    resumeText: c.resumeText,
  };
}

/** Profile completeness (0–100) and what's missing, for the dashboard. */
export function profileCompleteness(c: FullCandidate): { percent: number; missing: string[] } {
  const p = c.profile;
  const checks: [boolean, string][] = [
    [c.skills.length >= 3, "Add at least 3 skills"],
    [c.experiences.length > 0, "Add your work history"],
    [c.experiences.every((e) => !!e.start_date), "Add start dates to every role"],
    [c.educations.length > 0, "Add education or certifications"],
    [!!p.base_country, "Set the country you're based in"],
    [(p.authorized_countries ?? []).length > 0, "Add where you're authorised to work"],
    [p.needs_sponsorship != null, "Say whether you need visa sponsorship"],
    [(p.languages ?? []).length > 0, "Add the languages you speak"],
    [!!p.headline, "Add a headline"],
    [!!p.confirmed_at, "Review and confirm your profile"],
  ];
  const ok = checks.filter(([v]) => v).length;
  return { percent: Math.round((ok / checks.length) * 100), missing: checks.filter(([v]) => !v).map(([, m]) => m) };
}

/**
 * Write a parsed resume into the profile. Items the user typed or confirmed
 * (provenance "user") are kept; previously extracted/inferred items are replaced.
 */
export async function saveParsedResume(db: SupabaseClient, userId: string, resumeId: string, parsed: ParsedResume): Promise<void> {
  const { data: profile, error } = await db.from("candidate_profiles").select("id, headline, summary, base_country, languages").eq("user_id", userId).single();
  if (error || !profile) throw new Error("Candidate profile not found");
  const profileId = profile.id as string;

  await Promise.all([
    db.from("candidate_skills").delete().eq("user_id", userId).neq("provenance", "user"),
    db.from("experiences").delete().eq("user_id", userId).neq("provenance", "user"),
    db.from("educations").delete().eq("user_id", userId).neq("provenance", "user"),
  ]);

  const { data: kept } = await db.from("candidate_skills").select("normalized").eq("user_id", userId);
  const keptSkills = new Set((kept ?? []).map((k) => k.normalized as string));
  const skillRows = parsed.skills
    .filter((s) => !keptSkills.has(s.normalized || normalizeSkillName(s.name)))
    .map((s) => ({
      user_id: userId,
      candidate_profile_id: profileId,
      name: s.name.slice(0, 80),
      normalized: s.normalized || normalizeSkillName(s.name),
      provenance: s.provenance,
      evidence: s.evidence?.slice(0, 400) ?? null,
    }));
  const uniqueSkills = [...new Map(skillRows.map((r) => [r.normalized, r])).values()].filter((r) => r.normalized);
  if (uniqueSkills.length) {
    const { error: e } = await db.from("candidate_skills").insert(uniqueSkills);
    if (e) throw new Error(`skills: ${e.message}`);
  }

  if (parsed.experiences.length) {
    const { error: e } = await db.from("experiences").insert(
      parsed.experiences.map((x, i) => ({
        user_id: userId,
        candidate_profile_id: profileId,
        employer: x.employer.slice(0, 200),
        title: x.title.slice(0, 200),
        location: x.location ?? null,
        start_date: x.startDate ?? null,
        end_date: x.endDate && x.startDate && x.endDate < x.startDate ? null : x.endDate ?? null,
        is_current: x.isCurrent,
        description: x.description ?? null,
        highlights: x.highlights.map((h) => h.slice(0, 600)),
        skills: x.skills,
        provenance: x.provenance,
        evidence: x.evidence?.slice(0, 400) ?? null,
        sort_order: i,
      })),
    );
    if (e) throw new Error(`experiences: ${e.message}`);
  }

  if (parsed.educations.length) {
    const { error: e } = await db.from("educations").insert(
      parsed.educations.map((x, i) => ({
        user_id: userId,
        candidate_profile_id: profileId,
        kind: x.kind,
        institution: x.institution.slice(0, 200),
        qualification: x.qualification ?? null,
        field: x.field ?? null,
        level: x.level ?? null,
        start_date: x.startDate ?? null,
        end_date: x.endDate ?? null,
        provenance: x.provenance,
        evidence: x.evidence?.slice(0, 400) ?? null,
        sort_order: i,
      })),
    );
    if (e) throw new Error(`education: ${e.message}`);
  }

  const update: Record<string, unknown> = {
    source_resume_id: resumeId,
    years_experience: parsed.yearsExperience?.value ?? null,
    years_experience_provenance: parsed.yearsExperience?.provenance ?? null,
    seniority: parsed.seniority?.value ?? "unknown",
    seniority_provenance: parsed.seniority?.provenance ?? null,
    role_families: parsed.roleFamilies?.value ?? [],
    industries: parsed.industries?.value ?? [],
    contact: parsed.contact,
    confirmed_at: null,
  };
  // Don't overwrite things the user already set.
  if (!profile.headline && parsed.headline) update.headline = parsed.headline.value.slice(0, 200);
  if (!profile.summary && parsed.summary) update.summary = parsed.summary.value.slice(0, 2000);
  if (!profile.base_country && parsed.baseCountry) update.base_country = parsed.baseCountry.value;
  if ((profile.languages ?? []).length === 0 && parsed.languages.length) update.languages = parsed.languages;

  const { error: upErr } = await db.from("candidate_profiles").update(update).eq("id", profileId);
  if (upErr) throw new Error(`profile: ${upErr.message}`);

  if (parsed.fullName) {
    const { data: acct } = await db.from("profiles").select("full_name").eq("id", userId).single();
    if (!acct?.full_name) await db.from("profiles").update({ full_name: parsed.fullName.value.slice(0, 120) }).eq("id", userId);
  }
}
