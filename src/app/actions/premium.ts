"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateFollowUp, generateInterviewPrep } from "@/lib/services/premium";
import { UsageLimitError } from "@/lib/services/usage";

export type PremiumState = { error?: string; ok?: string } | undefined;
const uuid = z.string().uuid();

function message(err: unknown) {
  if (err instanceof UsageLimitError) return err.message;
  console.error("[premium action]", err);
  return "Something went wrong. Please try again.";
}

export async function interviewPrepAction(_: PremiumState, form: FormData): Promise<PremiumState> {
  const { user } = await requireUser();
  const jobId = uuid.parse(form.get("jobId"));
  try {
    await generateInterviewPrep(createAdminClient(), user.id, jobId);
  } catch (err) {
    return { error: message(err) };
  }
  revalidatePath(`/jobs/${jobId}/interview`);
  return { ok: "Ready." };
}

export async function followUpAction(_: PremiumState, form: FormData): Promise<PremiumState> {
  const { user } = await requireUser();
  const jobId = uuid.parse(form.get("jobId"));
  const contact = String(form.get("contact") ?? "").trim().slice(0, 80) || null;
  try {
    await generateFollowUp(createAdminClient(), user.id, jobId, contact);
  } catch (err) {
    return { error: message(err) };
  }
  revalidatePath(`/jobs/${jobId}/follow-up`);
  return { ok: "Ready." };
}
