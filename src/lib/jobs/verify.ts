// Listing verification: is this an official employer link, is it stale, does it look like a scam?
import { verification } from "../config";
import type { VerificationStatus } from "../types";

/** Applicant-tracking systems that host employers' own official application pages. */
export const OFFICIAL_ATS_DOMAINS = [
  "greenhouse.io",
  "job-boards.greenhouse.io",
  "boards.greenhouse.io",
  "lever.co",
  "jobs.lever.co",
  "ashbyhq.com",
  "jobs.ashbyhq.com",
  "myworkdayjobs.com",
  "smartrecruiters.com",
  "workable.com",
  "bamboohr.com",
  "recruitee.com",
  "teamtailor.com",
  "personio.de",
  "personio.com",
  "breezy.hr",
  "jobvite.com",
  "icims.com",
  "taleo.net",
  "successfactors.com",
  "rippling-ats.com",
  "dover.com",
  "pinpointhq.com",
  "homerun.co",
];

/** Job aggregators: legitimate sources, but not the employer's own page. */
export const AGGREGATOR_DOMAINS = [
  "remoteok.com",
  "remotive.com",
  "arbeitnow.com",
  "adzuna.com",
  "indeed.com",
  "linkedin.com",
  "glassdoor.com",
  "weworkremotely.com",
  "jooble.org",
  "ziprecruiter.com",
];

function domainMatches(host: string, list: string[]): boolean {
  return list.some((d) => host === d || host.endsWith("." + d));
}

const SCAM_PATTERNS: [RegExp, string][] = [
  [/\b(registration|application|training|processing|onboarding|starter[- ]kit) fee\b/i, "asks applicants to pay a fee"],
  [/\bpay (for|a) (your )?(training|equipment|kit|background check|visa processing)\b/i, "asks applicants to pay for training or equipment"],
  [/\b(western union|moneygram|gift cards?|send money|wire (the )?funds)\b/i, "mentions money transfers or gift cards"],
  [/\b(contact|message|text|reach) (us|me|the (hr|recruiter|hiring manager)) (on|via) (telegram|whatsapp|signal|google hangouts)\b/i, "asks applicants to move to a messaging app"],
  [/\b(no (interview|experience) (needed|required)[^.\n]{0,40}(earn|\$)|earn \$?\d{3,}[^.\n]{0,15}(per|a|\/) ?(day|week)\b)/i, "promises unusually easy money"],
  [/\b(cash(ing)? (a )?checks?|deposit (a )?check|reshipping|package forwarding)\b/i, "involves cashing checks or reshipping goods"],
  [/[\w.+-]+@(gmail|yahoo|hotmail|outlook|aol|proton(mail)?)\.(com|me)\b[^.\n]{0,40}\b(apply|send (your )?(cv|resume))|\b(apply|send (your )?(cv|resume))[^.\n]{0,40}[\w.+-]+@(gmail|yahoo|hotmail|outlook|aol)\.com\b/i, "asks for applications via a personal email address"],
  [/\b(bank account|social security number|ssn|bvn|passport (number|copy))\b[^.\n]{0,40}\b(before|to (apply|start|be considered))/i, "requests sensitive personal data up front"],
];

export interface VerificationInput {
  title: string;
  descriptionText: string;
  applyUrl: string | null;
  applyDomain: string | null;
  employerDomain: string | null;
  sourceIsOfficial: boolean;
  postedAt: string | null;
  deadlineAt: string | null;
  salaryMax: number | null;
  salaryPeriod: "year" | "month" | "hour" | null;
  now?: Date;
}

export interface VerificationResult {
  status: VerificationStatus;
  flags: string[];
  isOfficialLink: boolean;
  /** Listing should be hidden (expired or clearly unusable). */
  inactive: boolean;
}

export function isOfficialApplyDomain(applyDomain: string | null, employerDomain: string | null): boolean {
  if (!applyDomain) return false;
  if (domainMatches(applyDomain, OFFICIAL_ATS_DOMAINS)) return true;
  if (employerDomain && (applyDomain === employerDomain || applyDomain.endsWith("." + employerDomain))) return true;
  return false;
}

export function verifyJob(input: VerificationInput): VerificationResult {
  const now = input.now ?? new Date();
  const flags: string[] = [];
  let inactive = false;

  const isAggregatorLink = !!input.applyDomain && domainMatches(input.applyDomain, AGGREGATOR_DOMAINS);
  const isOfficialLink = !isAggregatorLink && isOfficialApplyDomain(input.applyDomain, input.employerDomain);

  if (!input.applyUrl) {
    flags.push("missing_apply_url");
    inactive = true;
  } else if (!/^https:\/\//i.test(input.applyUrl)) {
    flags.push("insecure_apply_url");
  }
  if (isAggregatorLink) flags.push("third_party_link");

  if (input.deadlineAt && new Date(input.deadlineAt) < now) {
    flags.push("deadline_passed");
    inactive = true;
  }
  if (input.postedAt) {
    const ageDays = (now.getTime() - new Date(input.postedAt).getTime()) / 86_400_000;
    if (ageDays > verification.staleAfterDays) flags.push("stale");
  }
  if (input.descriptionText.trim().length < 200) flags.push("thin_description");

  let suspicious = false;
  for (const [re, reason] of SCAM_PATTERNS) {
    if (re.test(input.descriptionText) || re.test(input.title)) {
      flags.push(`suspicious:${reason}`);
      suspicious = true;
    }
  }
  if (input.salaryMax != null) {
    const limit = input.salaryPeriod === "hour" ? 600 : input.salaryPeriod === "month" ? 120_000 : 1_500_000;
    if (input.salaryMax > limit) {
      flags.push("suspicious:salary looks unrealistic");
      suspicious = true;
    }
  }

  let status: VerificationStatus;
  if (suspicious) status = "flagged";
  else if (input.sourceIsOfficial && isOfficialLink) status = "official";
  else status = "third_party";

  return { status, flags, isOfficialLink, inactive };
}

/** Human-readable explanations for verification flags (shown on job cards). */
export function describeFlag(flag: string): string {
  if (flag.startsWith("suspicious:")) return `Caution: listing ${flag.slice("suspicious:".length)}`;
  switch (flag) {
    case "missing_apply_url":
      return "No application link provided";
    case "insecure_apply_url":
      return "Application link is not secure (http)";
    case "third_party_link":
      return "Links to a job board, not the employer's own page";
    case "deadline_passed":
      return "Application deadline has passed";
    case "stale":
      return `Posted more than ${verification.staleAfterDays} days ago and may be filled`;
    case "thin_description":
      return "Very short description";
    case "duplicate":
      return "Also listed elsewhere";
    default:
      return flag;
  }
}
