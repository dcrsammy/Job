import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ResetForm } from "@/components/auth-forms";
import { getUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPage() {
  const { user } = await getUser();
  if (!user) redirect("/forgot-password");
  return (
    <>
      <h1 className="mb-6 text-[28px] font-bold tracking-[-0.01em]">Choose a new password</h1>
      <ResetForm />
    </>
  );
}
