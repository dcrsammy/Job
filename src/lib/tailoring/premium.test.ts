import { describe, expect, it } from "vitest";
import type { AIProvider, StructuredRequest } from "../ai/provider";
import { effectivePlan, planFeatures, planLimits } from "../config";
import type { TailorCandidate, TailorJob } from "./generate";
import { buildFollowUpEmail, buildInterviewPrep } from "./premium";

const resumeText = "Ada Obi\nFrontend Developer — Paystack, Jan 2021 – Present\n• Reduced bundle size by 30%\nSkills: React, TypeScript";
const candidate: TailorCandidate = {
  fullName: "Ada Obi",
  headline: "Frontend Developer",
  summary: null,
  contact: {},
  skills: [
    { name: "React", normalized: "react", provenance: "extracted" },
    { name: "TypeScript", normalized: "typescript", provenance: "extracted" },
  ],
  experiences: [{ id: "e1", employer: "Paystack", title: "Frontend Developer", startDate: "2021-01-01", endDate: null, isCurrent: true, highlights: ["Reduced bundle size by 30%"], skills: [], provenance: "extracted" }],
  educations: [],
  yearsExperience: 5,
  baseCountry: "NG",
  authorizedCountries: ["NG"],
  needsSponsorship: true,
  salaryMin: null,
  salaryCurrency: null,
  languages: [],
  resumeText,
};
const job: TailorJob = { title: "Frontend Engineer", employerName: "Example Co", descriptionText: "React role", remoteType: "remote", locationRaw: null, requirements: [] };

function fakeProvider(output: unknown, seen: StructuredRequest<unknown>[] = []): AIProvider {
  return {
    name: "fake",
    async generateStructured<T>(req: StructuredRequest<T>) {
      seen.push(req as StructuredRequest<unknown>);
      return { data: req.validator.parse(output), usage: { provider: "fake", model: "m", inputTokens: 1, outputTokens: 1, costUsd: 0 } };
    },
  };
}

describe("plans", () => {
  it("only gives a paid plan while the subscription is active and not expired", () => {
    const now = new Date("2026-10-06T00:00:00Z");
    expect(effectivePlan(null)).toBe("free");
    expect(effectivePlan({ plan: "premium", status: "active" }, now)).toBe("premium");
    expect(effectivePlan({ plan: "pro", status: "canceled" }, now)).toBe("free");
    expect(effectivePlan({ plan: "pro", status: "active", current_period_end: "2026-10-01T00:00:00Z" }, now)).toBe("free");
    expect(effectivePlan({ plan: "pro", status: "active", current_period_end: "2026-11-01T00:00:00Z" }, now)).toBe("pro");
  });
  it("keeps the tiers in order: Basic manual, Pro auto-fill, Premium extras", () => {
    expect(planFeatures.free.completeAnswers).toBe(false);
    expect(planFeatures.pro.completeAnswers && planFeatures.pro.employerQuestions).toBe(true);
    expect(planFeatures.pro.interviewPrep || planFeatures.pro.followUps).toBe(false);
    expect(planFeatures.premium.interviewPrep && planFeatures.premium.followUps).toBe(true);
    for (const f of Object.keys(planLimits.free) as (keyof typeof planLimits.free)[]) {
      expect(planLimits.pro[f]).toBeGreaterThanOrEqual(planLimits.free[f]);
      expect(planLimits.premium[f]).toBeGreaterThanOrEqual(planLimits.pro[f]);
    }
  });
});

describe("interview prep", () => {
  it("flags invented figures and skills in suggested answers", async () => {
    const seen: StructuredRequest<unknown>[] = [];
    const { prep, warnings } = await buildInterviewPrep(
      fakeProvider(
        {
          overview: "Expect React questions.",
          focus_areas: ["React performance"],
          questions: [
            { category: "Technical", question: "Tell us about performance work", why_they_ask: "Core skill", answer: "At Paystack I reduced bundle size by 30%." },
            { category: "Technical", question: "GraphQL?", why_they_ask: "Stack", answer: "I led a GraphQL migration that cut latency by 70%." },
          ],
          gaps_to_prepare: [],
          questions_to_ask: ["How is the team structured?"],
        },
        seen,
      ),
      candidate,
      job,
      null,
    );
    expect(prep.questions).toHaveLength(2);
    expect(seen[0].feature).toBe("interview_prep");
    const text = warnings.map((w) => w.message).join(" ");
    expect(text).toMatch(/70%/);
    expect(text.toLowerCase()).toMatch(/graphql/);
    expect(text).not.toMatch(/30%/);
  });
});

describe("follow-up email", () => {
  it("returns subject and body and mentions timing in the prompt", async () => {
    const seen: StructuredRequest<unknown>[] = [];
    const { email, warnings } = await buildFollowUpEmail(
      fakeProvider({ subject: "Following up: Frontend Engineer", body: "Hello,\n\nI applied two weeks ago for the Frontend Engineer role and remain very interested. At Paystack I reduced bundle size by 30%.\n\nAda Obi" }, seen),
      candidate,
      job,
      { daysSinceApplied: 14, contactName: null },
    );
    expect(email.subject).toContain("Frontend Engineer");
    expect(warnings).toHaveLength(0);
    expect(seen[0].prompt).toContain("about two weeks ago");
    expect(seen[0].tier).toBe("fast");
  });
});
