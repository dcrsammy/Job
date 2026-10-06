import Link from "next/link";
import type { Metadata } from "next";
import { SignUpForm } from "@/components/auth-forms";
import { GoogleButton } from "@/components/google-button";

export const metadata: Metadata = { title: "Create an account" };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan } = await searchParams;
  const initial = plan === "pro" || plan === "premium" ? plan : "free";
  return (
    <>
      <h1 className="text-[28px] font-bold tracking-[-0.01em]">Create your account</h1>
      <p className="mt-1 mb-6 text-ink-2">Basic is free. Upload your resume next and see which jobs fit. <Link href="/pricing" className="underline underline-offset-2">Compare plans</Link></p>
      <GoogleButton next="/resume" />
      {process.env.NEXT_PUBLIC_GOOGLE_AUTH === "true" ? (
        <div className="my-5 flex items-center gap-3 text-[13px] text-ink-3">
          <span className="h-px flex-1 bg-line" />
          or with email
          <span className="h-px flex-1 bg-line" />
        </div>
      ) : null}
      <SignUpForm plan={initial} />
      <p className="mt-6 text-ink-2">
        Already have an account? <Link href="/login" className="font-semibold text-ink underline underline-offset-2">Sign in</Link>
      </p>
    </>
  );
}
