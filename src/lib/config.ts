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
export const planLimits: Record<PlanTier, { resume_parse: number; tailor: number; job_analysis: number }> = {
  free: { resume_parse: 3, tailor: 3, job_analysis: 10 },
  pro: { resume_parse: 30, tailor: 100, job_analysis: 300 },
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
