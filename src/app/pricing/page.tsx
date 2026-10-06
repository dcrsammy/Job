import type { Metadata } from "next";
import Link from "next/link";
import { PlanCard } from "@/components/plans";
import { PublicFooter, PublicHeader } from "@/components/public-header";
import { getUser } from "@/lib/auth";
import { PLAN_TIERS } from "@/lib/config";

export const metadata: Metadata = { title: "Pricing" };

export default async function PricingPage() {
  const { user } = await getUser();
  return (
    <div className="min-h-dvh">
      <PublicHeader signedIn={!!user} />
      <main className="mx-auto max-w-[1120px] px-4 py-12 sm:px-6">
        <h1 className="text-[34px] font-bold tracking-[-0.02em]">Plans</h1>
        <p className="mt-2 max-w-[60ch] text-ink-2">
          Every plan finds legitimate remote jobs, scores how well you fit and never sends an application for you. Paid plans do more of the writing, so you only review.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {PLAN_TIERS.map((p) => (
            <PlanCard
              key={p}
              plan={p}
              footer={
                <Link
                  href={user ? "/settings#plan" : `/signup?plan=${p}`}
                  className="inline-flex h-10 w-full items-center justify-center rounded-md bg-ink px-4 text-[14px] font-semibold text-paper hover:bg-ink-2"
                >
                  {user ? "Change plan" : p === "free" ? "Start free" : "Choose this plan"}
                </Link>
              }
            />
          ))}
        </div>
        <p className="mt-6 text-[13.5px] text-ink-3">Every AI-written answer is checked against your resume. Anything we had to assume, like a notice period, is listed for you to confirm.</p>
      </main>
      <PublicFooter />
    </div>
  );
}
