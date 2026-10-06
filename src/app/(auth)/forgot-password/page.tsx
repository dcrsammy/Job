import Link from "next/link";
import type { Metadata } from "next";
import { ForgotForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPage() {
  return (
    <>
      <h1 className="text-[28px] font-bold tracking-[-0.01em]">Reset your password</h1>
      <p className="mt-1 mb-6 text-ink-2">We'll email you a link to choose a new one.</p>
      <ForgotForm />
      <p className="mt-6 text-ink-2">
        <Link href="/login" className="underline underline-offset-2">Back to sign in</Link>
      </p>
    </>
  );
}
