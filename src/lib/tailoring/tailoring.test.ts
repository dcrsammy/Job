import { describe, expect, it } from "vitest";
import { assembleAiPackage, buildTemplatePackage, type TailorCandidate, type TailorJob } from "./generate";
import { inflatedYears, unsupportedNumbers, unsupportedSkills } from "./guard";
import { verifyAiResume, supportedBySource } from "../resume/ai-parse";
import { parseResumeHeuristically } from "../resume/heuristic";

const resumeText = `Ada Obi
Frontend Developer
Lagos, Nigeria · ada@example.com

EXPERIENCE
Frontend Developer — Paystack
Jan 2021 – Present
• Built checkout pages in React and TypeScript
• Reduced bundle size by 30%

Junior Developer at Andela
Jun 2019 – Dec 2020
• Fixed bugs in a Node.js API

EDUCATION
BSc Computer Science, University of Ibadan, 2019

SKILLS
React, TypeScript, Node.js, CSS`;

const candidate: TailorCandidate = {
  fullName: "Ada Obi",
  headline: "Frontend Developer",
  summary: null,
  contact: { email: "ada@example.com" },
  skills: ["React", "TypeScript", "Node.js", "CSS"].map((n) => ({ name: n, normalized: "", provenance: "extracted" as const })),
  experiences: [
    { id: "e1", employer: "Paystack", title: "Frontend Developer", startDate: "2021-01-01", endDate: null, isCurrent: true, highlights: ["Built checkout pages in React and TypeScript", "Reduced bundle size by 30%"], skills: [], provenance: "extracted" },
    { id: "e2", employer: "Andela", title: "Junior Developer", startDate: "2019-06-01", endDate: "2020-12-01", isCurrent: false, highlights: ["Fixed bugs in a Node.js API"], skills: [], provenance: "extracted" },
  ],
  educations: [{ id: "d1", kind: "degree", institution: "University of Ibadan", qualification: "BSc Computer Science", level: "bachelor", endDate: "2019-01-01", provenance: "extracted" }],
  yearsExperience: 5,
  baseCountry: "NG",
  authorizedCountries: ["NG"],
  needsSponsorship: true,
  salaryMin: null,
  salaryCurrency: null,
  languages: ["english"],
  resumeText,
};
candidate.skills.forEach((s) => (s.normalized = s.name === "Node.js" ? "nodejs" : s.name.toLowerCase()));

const job: TailorJob = {
  title: "Frontend Engineer",
  employerName: "Example Co",
  descriptionText: "Requirements\n- React\n- GraphQL",
  remoteType: "remote",
  locationRaw: "Remote",
  requirements: [
    { kind: "skill", text: "React", normalized: "react", importance: "required" },
    { kind: "skill", text: "GraphQL", normalized: "graphql", importance: "required" },
  ],
};

describe("fabrication guard", () => {
  it("finds numbers not in the source", () => {
    expect(unsupportedNumbers("Cut costs by 45% and grew revenue 3x", resumeText)).toEqual(["45%", "3x"]);
    expect(unsupportedNumbers("Reduced bundle size by 30%", resumeText)).toEqual([]);
  });
  it("finds skills the candidate doesn't have", () => {
    expect(unsupportedSkills("Expert in React and GraphQL", new Set(["react"]))).toEqual(["graphql"]);
    expect(unsupportedSkills("Strong JavaScript", new Set(["typescript"]))).toEqual([]); // implied
  });
  it("catches inflated experience claims", () => {
    expect(inflatedYears("I have 10+ years of experience", 5)).toHaveLength(1);
    expect(inflatedYears("I have 5 years of experience", 5)).toHaveLength(0);
  });
});

describe("AI package assembly", () => {
  const ai = {
    evidence_map: [{ requirement: "React", importance: "required" as const, status: "met" as const, fact_ids: ["exp:e1:h0"] }],
    recommendations: ["Lead with checkout work"],
    resume: {
      headline: "Frontend Developer",
      summary: "Frontend developer with 5 years of experience in React and GraphQL.",
      skills: ["React", "GraphQL", "TypeScript"],
      experiences: [
        { experience_id: "e1", bullets: [
          { text: "Built React checkout pages", fact_ids: ["exp:e1:h0"] },
          { text: "Reduced bundle size by 60%", fact_ids: ["exp:e1:h1"] },
          { text: "Led a team of 12 engineers", fact_ids: [] },
        ] },
        { experience_id: "ghost", bullets: [{ text: "Worked at Google", fact_ids: [] }] },
      ],
      education_ids: ["d1"],
    },
    cover_letter: "Dear team, I have 9 years of experience.",
    answers: [{ question: "Why us?", answer: "[Your reason]", needs_user_input: false, assumptions: [] }, { question: "Notice period?", answer: "Two weeks.", needs_user_input: false, assumptions: ["two-week notice period"] }],
    missing_info: [],
  };
  const pkg = assembleAiPackage(ai, candidate, job, null);

  it("never lets the model change employers, titles or dates, and keeps all real roles", () => {
    expect(pkg.resume.experiences.map((e) => e.employer)).toEqual(["Paystack", "Andela"]);
    expect(pkg.resume.experiences[0].dates).toBe("Jan 2021 – Present");
    expect(pkg.resumeText).not.toContain("Google");
  });
  it("drops bullets with no source or with unsupported figures", () => {
    expect(pkg.resume.experiences[0].bullets).toEqual(["Built React checkout pages"]);
    expect(pkg.warnings.map((w) => w.message).join(" ")).toMatch(/60%/);
    expect(pkg.warnings.map((w) => w.message).join(" ")).toMatch(/no supporting fact/);
  });
  it("removes skills the candidate doesn't have and warns about claims", () => {
    expect(pkg.resume.skills).toEqual(["React", "TypeScript"]);
    const all = pkg.warnings.map((w) => `${w.where}: ${w.message}`).join(" ");
    expect(all).toMatch(/Summary: Mentions skills not in your profile: GraphQL/);
    expect(all).toMatch(/Cover letter: Claims more experience/);
  });
  it("marks placeholder answers as needing input and builds a checklist", () => {
    expect(pkg.answers[0].needsUserInput).toBe(true);
    expect(pkg.checklist.find((c) => c.id === "placeholders")).toBeTruthy();
  });
});

describe("template package (no AI)", () => {
  const pkg = buildTemplatePackage(candidate, job, null);
  it("uses only profile facts and puts matching skills first", () => {
    expect(pkg.resume.skills[0]).toBe("React");
    expect(pkg.resumeText).toContain("Paystack");
    expect(pkg.coverLetter).toMatch(/\[/); // placeholders for the user's own words
    expect(pkg.evidenceMap.find((e) => e.requirement === "GraphQL")?.status).toBe("missing");
  });
});

describe("resume parsing", () => {
  it("parses a typical resume heuristically with evidence", () => {
    const p = parseResumeHeuristically(resumeText, new Date("2026-01-01"));
    expect(p.experiences.map((e) => [e.title, e.employer])).toEqual([
      ["Frontend Developer", "Paystack"],
      ["Junior Developer", "Andela"],
    ]);
    expect(p.experiences[0].isCurrent).toBe(true);
    expect(p.experiences[0].highlights).toHaveLength(2);
    expect(p.educations[0].level).toBe("bachelor");
    expect(p.baseCountry?.value).toBe("NG");
    expect(p.contact.location).toBe("Lagos, Nigeria");
    expect(p.skills.map((s) => s.normalized)).toEqual(expect.arrayContaining(["react", "typescript", "nodejs", "css"]));
    expect(p.yearsExperience?.provenance).toBe("inferred");
  });

  it("downgrades AI-extracted facts that aren't in the resume", () => {
    const parsed = verifyAiResume(
      {
        full_name: { value: "Ada Obi", evidence: "Ada Obi" },
        skills: [{ name: "React", evidence: "React, TypeScript" }, { name: "Kubernetes", evidence: null }],
        experiences: [
          { employer: "Paystack", title: "Frontend Developer", start_date: "2021-01", end_date: null, is_current: true, highlights: ["Built checkout pages in React and TypeScript", "Managed a $2M budget"], skills: ["React", "Kafka"], evidence: "Frontend Developer — Paystack" },
          { employer: "Google", title: "Engineer", start_date: "2018", end_date: "2019", is_current: false, highlights: [], skills: [], evidence: null },
        ],
        education: [],
        languages: ["english"],
        role_families: ["frontend"],
        industries: ["fintech"],
        missing: [],
      },
      resumeText,
    );
    expect(parsed.skills.find((s) => s.name === "Kubernetes")?.provenance).toBe("inferred");
    expect(parsed.experiences[0].provenance).toBe("extracted");
    expect(parsed.experiences[0].highlights).toEqual(["Built checkout pages in React and TypeScript"]);
    expect(parsed.experiences[0].skills).toEqual(["React"]);
    expect(parsed.experiences[1].provenance).toBe("inferred");
    expect(parsed.missing.join(" ")).toMatch(/authorised/);
  });

  it("matches source text loosely but not loosely enough to accept inventions", () => {
    expect(supportedBySource("•  Built checkout pages in   React and TypeScript", resumeText)).toBe(true);
    expect(supportedBySource("Led migration to microservices on AWS", resumeText)).toBe(false);
  });
});

describe("complete answers (Pro)", () => {
  it("turns AI assumptions into explicit check items", async () => {
    const { assembleAiPackage: assemble } = await import("./generate");
    const pkg = assemble(
      {
        evidence_map: [],
        recommendations: [],
        resume: { headline: "Frontend Developer", summary: "", skills: ["React"], experiences: [], education_ids: [] },
        cover_letter: "Dear team, I build checkout pages in React.",
        answers: [{ question: "When can you start?", answer: "Within two weeks of an offer.", needs_user_input: false, assumptions: ["two-week notice period"] }],
        missing_info: [],
      },
      candidate,
      job,
      null,
      undefined,
      { complete: true },
    );
    expect(pkg.answers[0].needsUserInput).toBe(true);
    expect(pkg.missingInfo[0]).toEqual({ question: "When can you start?", why: "Assumed: two-week notice period" });
  });

  it("splits pasted form questions", async () => {
    const { splitQuestions } = await import("./generate");
    expect(splitQuestions("1. Why do you want to join us?\n\n- What is your notice period?\n• Salary expectations\nok")).toEqual([
      "Why do you want to join us?",
      "What is your notice period?",
      "Salary expectations",
    ]);
  });
});
