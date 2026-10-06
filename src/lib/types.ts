// Shared domain types. Database rows use snake_case; these are the in-memory
// shapes the engines work with.

export type Provenance = "extracted" | "inferred" | "user";
export type RemoteType = "remote" | "hybrid" | "onsite" | "unknown";
export type Seniority =
  | "intern"
  | "junior"
  | "mid"
  | "senior"
  | "lead"
  | "principal"
  | "executive"
  | "unknown";
export type EducationLevel = "secondary" | "associate" | "bachelor" | "master" | "doctorate" | "other";
export type RemotePreference = "remote_only" | "remote_or_hybrid" | "any";
export type VerificationStatus = "official" | "third_party" | "flagged";
export type ApplicationStatus =
  | "saved"
  | "interested"
  | "preparing"
  | "applied"
  | "interview"
  | "rejected"
  | "offer"
  | "withdrawn";

export const SENIORITY_ORDER: Seniority[] = [
  "intern",
  "junior",
  "mid",
  "senior",
  "lead",
  "principal",
  "executive",
];

export const EDUCATION_ORDER: EducationLevel[] = ["secondary", "associate", "bachelor", "master", "doctorate"];

// ---------------------------------------------------------------------------
// Candidate
// ---------------------------------------------------------------------------
export interface CandidateSkill {
  name: string;
  normalized: string;
  years?: number | null;
  provenance: Provenance;
  evidence?: string | null;
}

export interface CandidateExperience {
  id?: string;
  employer: string;
  title: string;
  location?: string | null;
  startDate?: string | null; // YYYY-MM-DD
  endDate?: string | null;
  isCurrent: boolean;
  description?: string | null;
  highlights: string[];
  skills: string[];
  provenance: Provenance;
  evidence?: string | null;
}

export interface CandidateEducation {
  id?: string;
  kind: "degree" | "certification" | "course";
  institution: string;
  qualification?: string | null;
  field?: string | null;
  level?: EducationLevel | null;
  startDate?: string | null;
  endDate?: string | null;
  provenance: Provenance;
  evidence?: string | null;
}

export interface ProvenancedValue<T> {
  value: T;
  provenance: Provenance;
  evidence?: string | null;
}

/** Output of resume parsing, before the user reviews it. */
export interface ParsedResume {
  fullName: ProvenancedValue<string> | null;
  headline: ProvenancedValue<string> | null;
  summary: ProvenancedValue<string> | null;
  contact: { email?: string; phone?: string; location?: string; links?: string[] };
  skills: CandidateSkill[];
  experiences: CandidateExperience[];
  educations: CandidateEducation[];
  languages: string[];
  yearsExperience: ProvenancedValue<number> | null;
  seniority: ProvenancedValue<Seniority> | null;
  roleFamilies: ProvenancedValue<string[]> | null;
  industries: ProvenancedValue<string[]> | null;
  baseCountry: ProvenancedValue<string> | null;
  /** Things the parser could not determine and the user should supply. */
  missing: string[];
  parser: "ai" | "heuristic";
}

/** Everything the matching engine needs about a candidate. */
export interface CandidateForMatch {
  skills: CandidateSkill[];
  experiences: Pick<CandidateExperience, "title" | "employer" | "description" | "highlights" | "skills">[];
  educations: Pick<CandidateEducation, "kind" | "level" | "qualification" | "field" | "institution">[];
  yearsExperience: number | null;
  seniority: Seniority;
  roleFamilies: string[];
  industries: string[];
  baseCountry: string | null;
  authorizedCountries: string[];
  needsSponsorship: boolean | null;
  remotePreference: RemotePreference;
  languages: string[];
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------
export type RequirementKind =
  | "skill"
  | "experience"
  | "education"
  | "certification"
  | "authorization"
  | "location"
  | "language"
  | "other";

export interface JobRequirement {
  kind: RequirementKind;
  text: string;
  normalized?: string | null;
  importance: "required" | "preferred";
  minYears?: number | null;
  extractedBy?: "heuristic" | "ai";
}

/** A listing as returned by a connector, before normalization. */
export interface RawJob {
  externalId: string;
  title: string;
  employerName: string;
  descriptionHtml?: string | null;
  descriptionText?: string | null;
  locationRaw?: string | null;
  locations?: string[];
  countryCodes?: string[];
  remoteHint?: RemoteType | null;
  employmentType?: string | null;
  department?: string | null;
  salary?: { min?: number | null; max?: number | null; currency?: string | null; period?: "year" | "month" | "hour" | null; raw?: string | null } | null;
  postedAt?: string | null;
  deadlineAt?: string | null;
  applyUrl?: string | null;
  sourceUrl?: string | null;
  tags?: string[];
  employerWebsite?: string | null;
}

export interface NormalizedJob {
  externalId: string;
  title: string;
  normalizedTitle: string;
  employerName: string;
  normalizedEmployer: string;
  employerDomain: string | null;
  descriptionText: string;
  locationRaw: string | null;
  locations: string[];
  countries: string[];
  remoteType: RemoteType;
  remoteRegions: string[];
  employmentType: string | null;
  seniority: Seniority;
  department: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: "year" | "month" | "hour" | null;
  postedAt: string | null;
  deadlineAt: string | null;
  applyUrl: string | null;
  sourceUrl: string | null;
  applyDomain: string | null;
  isOfficialLink: boolean;
  fingerprint: string;
  requirements: JobRequirement[];
  verificationStatus: VerificationStatus;
  verificationFlags: string[];
}

/** Everything the matching engine needs about a job. */
export interface JobForMatch {
  id?: string;
  title: string;
  normalizedTitle: string;
  seniority: Seniority;
  remoteType: RemoteType;
  remoteRegions: string[];
  countries: string[];
  requirements: JobRequirement[];
  /** Short text used for domain/industry detection (title + department + first part of description). */
  domainText?: string;
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------
export interface ComponentScore {
  key:
    | "skills"
    | "role"
    | "seniority"
    | "education"
    | "location"
    | "authorization"
    | "domain";
  label: string;
  points: number;
  max: number;
  detail: string;
  status: "met" | "partial" | "missing" | "unknown";
}

export interface MatchResult {
  score: number;
  band: "high" | "possible" | "low";
  label: string;
  components: ComponentScore[];
  reasons: string[];
  gaps: string[];
  disqualifiers: string[];
  uncertain: string[];
  /** Explicit caps applied after summing components, with the reason. */
  adjustments: string[];
  matchedSkills: string[];
  missingRequiredSkills: string[];
  missingPreferredSkills: string[];
  engineVersion: string;
}
