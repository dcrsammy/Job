import Link from "next/link";
import { MatchBreakdown } from "@/components/match-breakdown";
import { PublicFooter, PublicHeader } from "@/components/public-header";
import { Notice } from "@/components/ui";
import { site } from "@/lib/config";
import { isSupabaseConfigured } from "@/lib/env";
import { WEIGHTS } from "@/lib/matching/engine";
import type { ComponentScore } from "@/lib/types";

// A worked example with a fictional employer, so visitors see exactly how a score is built.
const EXAMPLE: ComponentScore[] = [
  { key: "skills", label: "Skills", points: 38, max: WEIGHTS.skills, status: "met", detail: "You match 5 of 6 key skills (React, TypeScript, Node.js, PostgreSQL and 1 more)." },
  { key: "role", label: "Relevant experience", points: 15, max: WEIGHTS.role, status: "met", detail: "Your recent roles are in the same field as this job." },
  { key: "seniority", label: "Seniority & years", points: 11, max: WEIGHTS.seniority, status: "partial", detail: "Slightly under the 5+ years asked (you have ~4)." },
  { key: "education", label: "Education & certifications", points: 5, max: WEIGHTS.education, status: "met", detail: "No degree requirement stated." },
  { key: "location", label: "Location & remote", points: 10, max: WEIGHTS.location, status: "met", detail: "Remote, open to candidates in EMEA." },
  { key: "authorization", label: "Eligibility (authorisation & language)", points: 5, max: WEIGHTS.authorization, status: "met", detail: "No work-authorisation or language restrictions stated." },
  { key: "domain", label: "Industry & domain", points: 3, max: WEIGHTS.domain, status: "unknown", detail: "Industry not clear from the listing." },
];

const FACTORS: [string, number, string][] = [
  ["Skills", WEIGHTS.skills, "Key skills from the listing against the skills in your profile. Skills in the job title count double."],
  ["Relevant experience", WEIGHTS.role, "Whether your recent roles are in the same field."],
  ["Seniority and years", WEIGHTS.seniority, "The level and years of experience the listing asks for."],
  ["Location and remote", WEIGHTS.location, "Whether a remote role is open to people where you live."],
  ["Education", WEIGHTS.education, "Degrees and certifications, when the listing actually requires them."],
  ["Eligibility", WEIGHTS.authorization, "Work authorisation, visa sponsorship and required languages."],
  ["Industry", WEIGHTS.domain, "Whether you've worked in the same kind of business."],
];

export default async function Home({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const sp = await searchParams;
  let signedIn = false;
  if (isSupabaseConfigured()) {
    const { getUser } = await import("@/lib/auth");
    signedIn = !!(await getUser()).user;
  }
  const total = EXAMPLE.reduce((s, c) => s + c.points, 0);

  return (
    <div className="min-h-dvh">
      <PublicHeader signedIn={signedIn} />
      <main>
        {sp.deleted ? (
          <div className="mx-auto max-w-[1120px] px-4 pt-4 sm:px-6">
            <Notice tone="ok">Your account and all your data have been deleted.</Notice>
          </div>
        ) : null}

        <section className="mx-auto grid max-w-[1120px] gap-12 px-4 pt-12 pb-16 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:pt-20">
          <div>
            <h1 className="text-[44px] leading-[1.02] font-bold tracking-[-0.03em] sm:text-[60px]">
              Stop applying everywhere.
              <br />
              Start applying where you fit.
            </h1>
            <p className="mt-6 max-w-[52ch] text-[18px] leading-relaxed text-ink-2">
              Upload your resume. {site.name} reads live remote jobs straight from employers' own job boards, scores how well you fit each one, and shows you exactly why.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href={signedIn ? "/dashboard" : "/signup"} className="inline-flex h-12 items-center rounded-md bg-ink px-6 text-[16px] font-semibold text-paper hover:bg-ink-2">
                {signedIn ? "Open your dashboard" : "Find jobs that fit me"}
              </Link>
              <span className="text-[14px] text-ink-3">Free to start. No credit card.</span>
            </div>
          </div>

          <div className="rounded-[14px] border border-line bg-surface p-5 shadow-[0_1px_0_var(--line),0_24px_48px_-28px_rgba(19,35,58,0.35)] sm:p-6">
            <div className="mb-5 border-b border-line pb-4">
              <p className="text-[17px] font-semibold">Senior Frontend Engineer</p>
              <p className="text-ink-2">Northwind Labs (example)</p>
              <p className="mt-1 text-[13.5px] text-ink-3">Remote, EMEA. Posted 3 days ago. Employer's own listing</p>
            </div>
            <MatchBreakdown
              score={total}
              band="high"
              label="Strong match"
              components={EXAMPLE}
              reasons={["Skills match: React, TypeScript, Node.js, PostgreSQL", "Remote role you're eligible for (EMEA)"]}
              gaps={["Missing key skill: GraphQL", "Asks for 5+ years; you have ~4"]}
              disqualifiers={[]}
              uncertain={[]}
              adjustments={[]}
            />
          </div>
        </section>

        <section className="border-y border-line bg-surface">
          <div className="mx-auto grid max-w-[1120px] gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[320px_1fr]">
            <div>
              <h2 className="text-[30px] leading-tight font-bold tracking-[-0.02em]">A score you can check</h2>
              <p className="mt-3 text-ink-2">
                Every score adds up from fixed rules, not an AI guess. If a role is limited to a country you can't work in, we say so and rank it low, however good the rest looks.
              </p>
            </div>
            <dl className="divide-y divide-line border-y border-line">
              {FACTORS.map(([name, pts, desc]) => (
                <div key={name} className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 py-3.5 sm:grid-cols-[200px_1fr_auto]">
                  <dt className="font-semibold">{name}</dt>
                  <dd className="col-span-2 row-start-2 text-ink-2 sm:col-span-1 sm:row-start-1">{desc}</dd>
                  <dd className="text-right font-semibold num">{pts} pts</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="mx-auto grid max-w-[1120px] gap-12 px-4 py-16 sm:px-6 md:grid-cols-2">
          <div>
            <h2 className="text-[24px] font-bold tracking-[-0.015em]">Where the jobs come from</h2>
            <p className="mt-3 text-ink-2">
              Most listings come directly from employers' own job boards, so the apply button takes you to the real application page. Listings from job boards say so, and link back to them. Each listing is checked for missing links, expired deadlines, duplicates and common scam signs, like asking you to pay a fee.
            </p>
          </div>
          <div>
            <h2 className="text-[24px] font-bold tracking-[-0.015em]">Honest applications, prepared with you</h2>
            <p className="mt-3 text-ink-2">
              For any job, get a tailored resume, a cover letter draft and answers to likely questions. They use only facts from your own resume. Employers, titles and dates are never rewritten, and anything we can't verify is flagged for you to check. You review everything and apply yourself.
            </p>
          </div>
          <div>
            <h2 className="text-[24px] font-bold tracking-[-0.015em]">Your data stays yours</h2>
            <p className="mt-3 text-ink-2">
              Your resume is stored privately. Delete it, download everything, or set it to delete itself after 30 days. We don't sell data or share your profile with employers.
            </p>
          </div>
          <div>
            <h2 className="text-[24px] font-bold tracking-[-0.015em]">What we won't do</h2>
            <p className="mt-3 text-ink-2">
              We won't send applications for you, invent experience, or promise you'll get hired. We help you spend your time on roles where you have a real chance.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-[1120px] px-4 sm:px-6">
          <div className="flex flex-col items-start gap-5 rounded-[14px] bg-ink px-6 py-10 text-paper sm:flex-row sm:items-center sm:justify-between sm:px-10">
            <p className="max-w-[30ch] text-[26px] leading-tight font-bold tracking-[-0.02em]">See which jobs you fit, in about two minutes.</p>
            <Link href={signedIn ? "/dashboard" : "/signup"} className="inline-flex h-12 items-center rounded-md bg-tape px-6 text-[16px] font-semibold text-tape-ink hover:brightness-95">
              {signedIn ? "Open your dashboard" : "Upload your resume"}
            </Link>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
