/** Product-wide settings. Change the brand name here only. */
export const site = {
  name: "Aptly",
  tagline: "Stop applying everywhere. Start applying where you fit.",
  description:
    "Upload your resume, see legitimate remote jobs ranked by how well you actually fit, and prepare honest, tailored applications.",
  supportEmail: "support@example.com",
} as const;

/** Stored plan values. "free" is shown to users as Basic. */
export type PlanTier = "free" | "pro" | "premium";
export const PLAN_TIERS: PlanTier[] = ["free", "pro", "premium"];

/** Metered features and their monthly allowance per plan (0 = not included). */
export const planLimits: Record<
  PlanTier,
  { resume_parse: number; tailor: number; job_analysis: number; employer_questions: number; interview_prep: number; follow_up: number }
> = {
  free: { resume_parse: 3, tailor: 3, job_analysis: 10, employer_questions: 0, interview_prep: 0, follow_up: 0 },
  pro: { resume_parse: 30, tailor: 100, job_analysis: 300, employer_questions: 200, interview_prep: 0, follow_up: 0 },
  premium: { resume_parse: 100, tailor: 300, job_analysis: 1000, employer_questions: 600, interview_prep: 60, follow_up: 100 },
};

/**
 * What each plan unlocks.
 * - completeAnswers: the AI writes every answer in full (motivation, salary,
 *   availability, strengths…) instead of leaving [placeholders] for the user.
 * - employerQuestions: paste the questions from an employer's form and get a full answer to each.
 * - interviewPrep: likely interview questions for a job, with answers from the user's real experience.
 * - followUps: polite follow-up emails for applications that have gone quiet.
 * - matchesKept: how many ranked matches we keep per user.
 */
export const planFeatures: Record<
  PlanTier,
  { completeAnswers: boolean; employerQuestions: boolean; interviewPrep: boolean; followUps: boolean; matchesKept: number }
> = {
  free: { completeAnswers: false, employerQuestions: false, interviewPrep: false, followUps: false, matchesKept: 300 },
  pro: { completeAnswers: true, employerQuestions: true, interviewPrep: false, followUps: false, matchesKept: 300 },
  premium: { completeAnswers: true, employerQuestions: true, interviewPrep: true, followUps: true, matchesKept: 600 },
};

/** How plans are presented. Prices are placeholders until payments are connected. */
export const planInfo: Record<PlanTier, { name: string; price: string; blurb: string; points: string[] }> = {
  free: {
    name: "Basic",
    price: "Free",
    blurb: "Find where you fit and do the writing yourself.",
    points: [
      "Unlimited job matching and search",
      `${planLimits.free.tailor} tailored applications a month`,
      "Cover letter and answers drafted with [placeholders] for you to complete",
      "Application tracker",
    ],
  },
  pro: {
    name: "Pro",
    price: "$9 / month",
    blurb: "Every answer written for you. You just review.",
    points: [
      "Everything in Basic",
      `${planLimits.pro.tailor} tailored applications a month`,
      "Complete cover letter and every answer filled in, salary and availability included",
      "Answers to the questions on the employer's own form",
    ],
  },
  premium: {
    name: "Premium",
    price: "$19 / month",
    blurb: "From application to interview.",
    points: [
      "Everything in Pro",
      `${planLimits.premium.tailor} tailored applications a month`,
      "Interview prep for each job: likely questions with answers from your real experience",
      "Follow-up emails for applications that have gone quiet",
      `Twice as many ranked matches (${planFeatures.premium.matchesKept})`,
    ],
  },
};

export const planName = (p: PlanTier | string | null | undefined) => planInfo[(p as PlanTier) in planInfo ? (p as PlanTier) : "free"].name;

/** Which plan a subscription row actually gives right now. */
export function effectivePlan(sub: { plan?: string | null; status?: string | null; current_period_end?: string | null } | null | undefined, now = new Date()): PlanTier {
  if (!sub || sub.status === "canceled") return "free";
  if (sub.current_period_end && new Date(sub.current_period_end) < now) return "free";
  return sub.plan === "pro" || sub.plan === "premium" ? sub.plan : "free";
}

export type MeteredFeature = keyof (typeof planLimits)["free"];

export const matching = {
  /** Jobs older than this are not recommended. */
  maxJobAgeDays: 120,
  /** Max jobs pre-selected by full-text search before precise scoring. */
  candidatePool: 1500,
  /** Matches kept per user. */
  keepTop: 300,
  strongThreshold: 75,
  possibleThreshold: 55,
} as const;

export const verification = {
  staleAfterDays: 60,
} as const;
