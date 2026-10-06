import { describe, expect, it } from "vitest";
import { scoreMatch, yearsFromExperiences } from "./engine";
import type { CandidateForMatch, JobForMatch } from "../types";
import { extractRequirements, seniorityFromTitle } from "../jobs/requirements";

const lagosDev: CandidateForMatch = {
  skills: ["React", "TypeScript", "Next.js", "Node.js", "PostgreSQL", "Tailwind CSS"].map((name) => ({
    name,
    normalized: "",
    provenance: "extracted" as const,
  })),
  experiences: [
    { title: "Full-Stack Developer", employer: "DCR Agency", description: "", highlights: [], skills: [] },
    { title: "Frontend Developer", employer: "Upwork clients", description: "", highlights: [], skills: [] },
  ],
  educations: [{ kind: "degree", level: "bachelor", qualification: "BSc Computer Science", field: "Computer Science", institution: "Nanjing University of Technology" }],
  yearsExperience: 5,
  seniority: "mid",
  roleFamilies: [],
  industries: ["ecommerce", "fintech"],
  baseCountry: "NG",
  authorizedCountries: ["NG"],
  needsSponsorship: true,
  remotePreference: "remote_only",
  languages: ["english"],
};
lagosDev.skills.forEach((s) => (s.normalized = ""));

function job(partial: Partial<JobForMatch> & { description?: string }): JobForMatch {
  const description = partial.description ?? "";
  return {
    title: partial.title ?? "Software Engineer",
    normalizedTitle: (partial.title ?? "Software Engineer").toLowerCase(),
    seniority: partial.seniority ?? seniorityFromTitle(partial.title ?? ""),
    remoteType: partial.remoteType ?? "remote",
    remoteRegions: partial.remoteRegions ?? ["WORLDWIDE"],
    countries: partial.countries ?? [],
    requirements: partial.requirements ?? extractRequirements(description),
    domainText: partial.domainText ?? description,
  };
}

const goodDescription = `About us
We build payments infrastructure for online merchants. Our payments platform serves fintech companies.

Requirements
- 4+ years of experience building web applications
- Strong React and TypeScript skills
- Experience with Node.js and PostgreSQL

Nice to have
- GraphQL
- Experience with AWS`;

describe("scoreMatch", () => {
  it("gives a strong, explained score to a well-matched worldwide remote job", () => {
    const r = scoreMatch(lagosDev, job({ title: "Full Stack Engineer", description: goodDescription }));
    expect(r.band).toBe("high");
    expect(r.score).toBeGreaterThanOrEqual(75);
    expect(r.disqualifiers).toEqual([]);
    expect(r.matchedSkills).toEqual(expect.arrayContaining(["react", "typescript", "nodejs", "postgresql"]));
    expect(r.missingPreferredSkills).toEqual(expect.arrayContaining(["graphql", "aws"]));
    expect(r.reasons.join(" ")).toMatch(/Remote and open worldwide/);
    // components add up to the score (no caps applied here)
    expect(r.adjustments).toEqual([]);
    expect(r.components.reduce((s, c) => s + c.points, 0)).toBe(r.score);
    expect(r.components.reduce((s, c) => s + c.max, 0)).toBe(100);
  });

  it("disqualifies a remote job limited to a region the candidate is not in", () => {
    const r = scoreMatch(lagosDev, job({ title: "Full Stack Engineer", description: goodDescription, remoteRegions: ["US"] }));
    expect(r.disqualifiers[0]).toMatch(/limited to United States/);
    expect(r.score).toBeLessThanOrEqual(35);
    expect(r.label).toBe("Not eligible");
    expect(r.adjustments[0]).toMatch(/hard requirement/);
  });

  it("never calls a job a strong match when most key skills are missing", () => {
    const r = scoreMatch(
      lagosDev,
      job({ title: "Platform Engineer", description: "Requirements\n- PostgreSQL\n- TypeScript\n- AWS\n- Kubernetes\n- Terraform\n- Ansible\n- Linux\n- Go\n- Kafka" }),
    );
    expect(r.band).not.toBe("high");
  });

  it("ranks a role in a different field low even with keyword overlap", () => {
    const r = scoreMatch(lagosDev, job({ title: "Account Executive", description: "Requirements\n- Experience selling to developers who use React and PostgreSQL\n- B2B sales" }));
    expect(r.score).toBeLessThanOrEqual(50);
    expect(r.gaps.join(" ")).toMatch(/different field/i);
  });

  it("treats EMEA as including Nigeria", () => {
    const r = scoreMatch(lagosDev, job({ title: "Frontend Engineer", description: goodDescription, remoteRegions: ["EMEA"] }));
    expect(r.disqualifiers).toEqual([]);
  });

  it("flags missing required skills and years as gaps", () => {
    const r = scoreMatch(
      lagosDev,
      job({
        title: "Senior Backend Engineer",
        description: "Requirements\n- 8+ years of professional experience\n- Expert in Go and Kubernetes\n- Kafka experience",
      }),
    );
    expect(r.missingRequiredSkills).toEqual(expect.arrayContaining(["go", "kubernetes", "kafka"]));
    expect(r.gaps.join(" ")).toMatch(/8\+ years/);
    expect(r.band).not.toBe("high");
  });

  it("disqualifies when sponsorship is needed but not offered", () => {
    const r = scoreMatch(
      lagosDev,
      job({ description: "Requirements\n- React\nWe are unable to provide visa sponsorship for this role.", remoteType: "onsite", remoteRegions: [], countries: ["GB"] }),
    );
    expect(r.disqualifiers.join(" ")).toMatch(/sponsorship|remote/i);
  });

  it("marks unknowns as uncertain instead of guessing", () => {
    const r = scoreMatch(lagosDev, job({ title: "Engineer", description: "", remoteRegions: [] }));
    expect(r.uncertain.length).toBeGreaterThan(0);
    expect(r.components.find((c) => c.key === "skills")?.status).toBe("unknown");
  });

  it("requires the listing language when it is not English", () => {
    const r = scoreMatch(lagosDev, job({ requirements: [{ kind: "language", text: "German", normalized: "german", importance: "required" }] }));
    expect(r.disqualifiers).toContain("Requires German");
  });

  it("credits implied skills partially (Next.js implies React)", () => {
    const cand = { ...lagosDev, skills: [{ name: "Next.js", normalized: "nextjs", provenance: "extracted" as const }] };
    const r = scoreMatch(cand, job({ requirements: [{ kind: "skill", text: "React", normalized: "react", importance: "required" }] }));
    expect(r.matchedSkills).toContain("react");
    const skills = r.components.find((c) => c.key === "skills")!;
    expect(skills.points).toBeGreaterThan(0);
    expect(skills.points).toBeLessThan(skills.max);
  });
});

describe("yearsFromExperiences", () => {
  it("merges overlapping roles", () => {
    const y = yearsFromExperiences(
      [
        { startDate: "2020-01-01", endDate: "2022-01-01" },
        { startDate: "2021-01-01", endDate: "2023-01-01" },
      ],
      new Date("2024-01-01"),
    );
    expect(y).toBeCloseTo(3, 0);
  });
  it("returns null with no dates", () => {
    expect(yearsFromExperiences([{}])).toBeNull();
  });
});
