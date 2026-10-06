import Link from "next/link";
import type { Metadata } from "next";
import { SignInForm } from "@/components/auth-forms";
import { GoogleButton } from "@/components/google-button";
import { Notice } from "@/components/ui";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <>
      <h1 className="mb-6 text-[28px] font-bold tracking-[-0.01em]">Sign in</h1>
      {error ? (
        <div className="mb-4">
          <Notice tone="error">{error === "oauth" ? "Google sign-in isn't available right now. Use your email instead." : "That link has expired or was already used. Sign in, or request a new link."}</Notice>
        </div>
      ) : null}
      <GoogleButton next={next} />
      {process.env.NEXT_PUBLIC_GOOGLE_AUTH === "true" ? (
        <div className="my-5 flex items-center gap-3 text-[13px] text-ink-3">
          <span className="h-px flex-1 bg-line" />
          or with email
          <span className="h-px flex-1 bg-line" />
        </div>
      ) : null}
      <SignInForm next={next} />
      <p className="mt-6 text-ink-2">
        New here? <Link href="/signup" className="font-semibold text-ink underline underline-offset-2">Create an account</Link>
      </p>
    </>
  );
}
