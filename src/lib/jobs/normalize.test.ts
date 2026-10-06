import { describe, expect, it } from "vitest";
import { fingerprint, normalizeEmployer, normalizeJob, normalizeTitle, parseSalaryText } from "./normalize";
import { verifyJob } from "./verify";
import { extractRequirements, seniorityFromTitle, detectListingLanguage } from "./requirements";
import { parseLocation, remoteEligibility } from "../geo";
import { htmlToText } from "../text";
import { findSkills } from "../skills/taxonomy";
import { isAllowedByRobots } from "./http";
import { extractJsonLdPostings } from "./connectors";

describe("normalization", () => {
  it("cleans titles and employers for dedupe", () => {
    expect(normalizeTitle("Sr. Frontend Engineer (m/w/d) - Remote")).toBe("senior frontend engineer");
    expect(normalizeEmployer("Acme Technologies, Inc.")).toBe("acme");
    expect(fingerprint("Acme Inc", "Senior Engineer", "remote:US")).toBe(fingerprint("ACME", "Senior  Engineer", "remote:us"));
  });

  it("parses salary strings", () => {
    expect(parseSalaryText("$120k - $150k")).toMatchObject({ min: 120000, max: 150000, currency: "USD", period: "year" });
    expect(parseSalaryText("€60,000–€75,000 a year")).toMatchObject({ min: 60000, max: 75000, currency: "EUR" });
    expect(parseSalaryText("$40/hr")).toMatchObject({ min: 40, period: "hour" });
  });

  it("rounds fractional salaries from APIs", () => {
    const j = normalizeJob({ externalId: "1", title: "Analyst", employerName: "X", descriptionText: "x".repeat(300), salary: { min: 90.5, max: 108.17, currency: "USD", period: "hour" }, applyUrl: "https://jobs.lever.co/x/1" }, { sourceIsOfficial: true });
    expect(j.salaryMin).toBe(91);
    expect(j.salaryMax).toBe(108);
  });

  it("converts escaped Greenhouse HTML to text with list items", () => {
    const t = htmlToText("&lt;h3&gt;Requirements&lt;/h3&gt;&lt;ul&gt;&lt;li&gt;React&lt;/li&gt;&lt;li&gt;5+ years&lt;/li&gt;&lt;/ul&gt;");
    expect(t).toContain("Requirements");
    expect(t).toContain("- React");
  });
});

describe("locations", () => {
  it("understands remote regions", () => {
    expect(parseLocation(["Remote - US"]).remoteRegions).toEqual(["US"]);
    expect(parseLocation(["Remote (EMEA)"]).remoteRegions).toEqual(["EMEA"]);
    expect(parseLocation(["Anywhere in the world"]).remoteRegions).toEqual(["WORLDWIDE"]);
    expect(parseLocation(["Hybrid - London"]).remoteType).toBe("hybrid");
    expect(parseLocation(["San Francisco, CA"]).countries).toEqual(["US"]);
    expect(parseLocation(["Remote"]).remoteRegions).toEqual([]); // not stated ≠ worldwide
    expect(parseLocation(["Remote, AMER"]).remoteRegions).toEqual(["AMERICAS"]);
    expect(parseLocation(["AMER"])).toMatchObject({ remoteType: "remote", remoteRegions: ["AMERICAS"] });
    expect(parseLocation(["Home based - EMEA"])).toMatchObject({ remoteType: "remote", remoteRegions: ["EMEA"] });
  });
  it("does not read 'us' the pronoun as the United States", () => {
    expect(parseLocation(["Join us remotely"]).countries).toEqual([]);
  });
  it("checks eligibility", () => {
    expect(remoteEligibility(["EMEA"], ["NG"])).toBe("eligible");
    expect(remoteEligibility(["EUROPE"], ["NG"])).toBe("ineligible");
    expect(remoteEligibility([], ["NG"])).toBe("unknown");
  });
});

describe("skills", () => {
  it("avoids common false positives", () => {
    expect(findSkills("Go to market with our sales team")).not.toContain("go");
    expect(findSkills("We use Go and Rust")).toEqual(expect.arrayContaining(["go", "rust"]));
    expect(findSkills("JavaScript developer")).not.toContain("java");
    expect(findSkills("the rest of the team")).not.toContain("rest-api");
    expect(findSkills("R&D budget")).not.toContain("r");
    expect(findSkills("Node.js, C++ and C#")).toEqual(expect.arrayContaining(["nodejs", "cpp", "csharp"]));
  });
});

describe("requirements", () => {
  const desc = `About us
We build payments software using React.

Requirements
- 5+ years of professional experience
- Strong TypeScript skills
- Bachelor's degree in CS or equivalent experience
- Must be authorized to work in the United States
- We are unable to provide visa sponsorship

Nice to have
- Experience with GraphQL

Benefits
- Kubernetes stipend`;
  const reqs = extractRequirements(desc);
  it("separates required and preferred skills by section", () => {
    expect(reqs.find((r) => r.normalized === "typescript")?.importance).toBe("required");
    expect(reqs.find((r) => r.normalized === "graphql")?.importance).toBe("preferred");
    expect(reqs.find((r) => r.normalized === "react")?.importance).toBe("preferred"); // only in "About us"
    expect(reqs.find((r) => r.normalized === "kubernetes")).toBeUndefined(); // benefits ignored
  });
  it("extracts years, education and authorisation", () => {
    expect(reqs.find((r) => r.kind === "experience")?.minYears).toBe(5);
    expect(reqs.find((r) => r.kind === "education")).toMatchObject({ normalized: "bachelor", importance: "preferred" });
    expect(reqs.some((r) => r.normalized === "authorized:US")).toBe(true);
    expect(reqs.some((r) => r.normalized === "no_sponsorship")).toBe(true);
  });
  it("ignores skills that are the employer's own product", () => {
    expect(extractRequirements("Requirements\n- Experience with Notion", { employerName: "Notion" }).some((r) => r.normalized === "notion")).toBe(false);
  });
  it("detects listing language", () => {
    expect(detectListingLanguage("Wir suchen eine erfahrene Person für unser Team und die Entwicklung mit React. Du bist bei uns richtig, wenn du Erfahrung mit der Entwicklung hast und die Arbeit im Team magst. Wir bieten eine flexible Arbeit und das ist für uns wichtig, mit einem tollen Team auf einer modernen Plattform.")).toBe("german");
  });
  it("reads seniority from titles", () => {
    expect(seniorityFromTitle("Senior Backend Engineer")).toBe("senior");
    expect(seniorityFromTitle("Staff Engineer")).toBe("lead");
    expect(seniorityFromTitle("Head of Marketing")).toBe("executive");
    expect(seniorityFromTitle("Software Engineering Intern")).toBe("intern");
  });
});

describe("verification", () => {
  const base = { title: "Engineer", descriptionText: "x".repeat(400), applyDomain: "job-boards.greenhouse.io", applyUrl: "https://job-boards.greenhouse.io/a/1", employerDomain: null, sourceIsOfficial: true, postedAt: new Date().toISOString(), deadlineAt: null, salaryMax: null, salaryPeriod: null } as const;
  it("marks ATS links from employer boards as official", () => {
    expect(verifyJob(base).status).toBe("official");
  });
  it("marks aggregator links as third party", () => {
    const r = verifyJob({ ...base, applyDomain: "remoteok.com", applyUrl: "https://remoteok.com/x", sourceIsOfficial: false });
    expect(r.status).toBe("third_party");
    expect(r.flags).toContain("third_party_link");
  });
  it("flags scam patterns", () => {
    const r = verifyJob({ ...base, descriptionText: "Great job! A small registration fee of $50 is required. Contact us on Telegram to start." + "x".repeat(300) });
    expect(r.status).toBe("flagged");
  });
  it("deactivates past deadlines and flags stale posts", () => {
    expect(verifyJob({ ...base, deadlineAt: "2020-01-01" }).inactive).toBe(true);
    expect(verifyJob({ ...base, postedAt: "2020-01-01" }).flags).toContain("stale");
  });
});

describe("compliance helpers", () => {
  it("honours robots.txt with longest-match rules", () => {
    const robots = "User-agent: *\nDisallow: /careers/private\nAllow: /careers\n";
    expect(isAllowedByRobots(robots, "https://x.com/careers/123")).toBe(true);
    expect(isAllowedByRobots(robots, "https://x.com/careers/private/1")).toBe(false);
    expect(isAllowedByRobots("User-agent: *\nDisallow: /", "https://x.com/jobs")).toBe(false);
  });
  it("reads schema.org JobPosting JSON-LD", () => {
    const html = `<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"JobPosting","title":"Designer","hiringOrganization":{"name":"Acme"},"jobLocationType":"TELECOMMUTE"}]}</script>`;
    expect(extractJsonLdPostings(html)[0]).toMatchObject({ title: "Designer" });
  });
});
