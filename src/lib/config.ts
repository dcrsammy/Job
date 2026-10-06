/** Product-wide settings. Change the brand name here only. */
export const site = {
  name: "Aptly",
  tagline: "Stop applying everywhere. Start applying where you fit.",
  description:
    "Upload your resume, see legitimate remote jobs ranked by how well you actually fit, and prepare honest, tailored applications.",
  supportEmail: "support@example.com",
} as const;

export type PlanTier = "free" | "pro";

/** Metered AI features and their monthly allowance per plan. */
export const planLimits: Record<PlanTier, { resume_parse: number; tailor: number; job_analysis: number; employer_questions: number }> = {
  free: { resume_parse: 3, tailor: 3, job_analysis: 10, employer_questions: 0 },
  pro: { resume_parse: 30, tailor: 100, job_analysis: 300, employer_questions: 200 },
};

/**
 * What each plan unlocks in the Application builder.
 * - completeAnswers: the AI writes every answer in full (motivation, salary,
 *   availability, strengths…) instead of leaving [placeholders] for the user.
 * - employerQuestions: paste the questions from an employer's application
 *   form and get a full answer to each.
 */
export const planFeatures: Record<PlanTier, { completeAnswers: boolean; employerQuestions: boolean }> = {
  free: { completeAnswers: false, employerQuestions: false },
  pro: { completeAnswers: true, employerQuestions: true },
};

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
