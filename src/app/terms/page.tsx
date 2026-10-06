import type { Metadata } from "next";
import { PublicFooter, PublicHeader } from "@/components/public-header";
import { site } from "@/lib/config";

export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <div className="min-h-dvh">
      <PublicHeader signedIn={false} />
      <main className="mx-auto max-w-[72ch] px-4 py-12 sm:px-6">
        <h1 className="text-[34px] font-bold tracking-[-0.02em]">Terms of use</h1>
        <p className="mt-2 text-ink-3">This is a starting template. Have it reviewed before launch.</p>
        <div className="mt-8 space-y-4 leading-relaxed text-ink-2">
          <p>{site.name} helps you find job listings that match your profile and prepare application materials. It is not an employer, recruiter or employment agency, and it does not guarantee interviews or jobs.</p>
          <p>Match scores are estimates based on the information in your profile and in the listing, and can be wrong. Always read the full listing on the employer's site before applying.</p>
          <p>You are responsible for the accuracy of anything you send to an employer. Only include experience, skills and qualifications you actually have.</p>
          <p>Job listings belong to the employers and job boards that publish them. Each listing links to its source.</p>
          <p>Don't use {site.name} to scrape listings, create accounts for others without permission, or upload content you don't have the right to use.</p>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
