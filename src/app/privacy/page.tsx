import type { Metadata } from "next";
import { PublicFooter, PublicHeader } from "@/components/public-header";
import { site } from "@/lib/config";

export const metadata: Metadata = { title: "Privacy notice" };

export default function PrivacyPage() {
  return (
    <div className="min-h-dvh">
      <PublicHeader signedIn={false} />
      <main className="mx-auto max-w-[72ch] px-4 py-12 sm:px-6">
        <h1 className="text-[34px] font-bold tracking-[-0.02em]">Privacy notice</h1>
        <p className="mt-2 text-ink-3">This is a starting template. Have it reviewed for the countries you operate in before launch.</p>
        <div className="mt-8 space-y-6 leading-relaxed text-ink-2 [&_h2]:mb-2 [&_h2]:text-[19px] [&_h2]:font-bold [&_h2]:text-ink">
          <section>
            <h2>What we collect</h2>
            <p>Your account details (email, name), the resume files you upload, the profile we build from them, the jobs you save, hide or view, the applications you prepare, and a log of account activity.</p>
          </section>
          <section>
            <h2>How we use it</h2>
            <p>Only to run {site.name} for you: building your career profile, scoring jobs against it, drafting application materials you ask for, and tracking your applications. We don't sell your data, show you ads based on it, or share your profile with employers.</p>
          </section>
          <section>
            <h2>AI processing</h2>
            <p>When you upload a resume or prepare an application, the relevant text is sent to our AI provider to process that request. Under our agreement it isn't used to train their models. Generated text is checked against your own resume, and you review everything before using it.</p>
          </section>
          <section>
            <h2>Storage and security</h2>
            <p>Files are kept in private storage that only your account can access. Database access is restricted so each user can only read their own records. Connections are encrypted.</p>
          </section>
          <section>
            <h2>Your controls</h2>
            <p>From Settings & privacy you can download all your data, delete your resume files and profile data, set resume files to delete automatically after 30, 90, 180 or 365 days, or delete your account and everything linked to it.</p>
          </section>
          <section>
            <h2>Job listings</h2>
            <p>Job listings come from employers' public job boards and job boards whose terms allow it. Each listing shows its source and links to the original.</p>
          </section>
          <section>
            <h2>Contact</h2>
            <p>Questions or requests: {site.supportEmail}</p>
          </section>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
