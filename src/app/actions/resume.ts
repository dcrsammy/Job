"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ResumeFileError } from "@/lib/resume/extract-text";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteResume, processResumeUpload } from "@/lib/services/resume";
import { UsageLimitError } from "@/lib/services/usage";

export type UploadState = { error?: string } | undefined;

export async function uploadResume(_: UploadState, form: FormData): Promise<UploadState> {
  const { user } = await requireUser();
  const file = form.get("resume");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a PDF or Word file to upload." };
  let note: string | undefined;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await processResumeUpload(createAdminClient(), user.id, { name: file.name, size: file.size, bytes });
    note = result.note;
  } catch (err) {
    if (err instanceof ResumeFileError || err instanceof UsageLimitError) return { error: err.message };
    console.error("resume upload failed", err);
    return { error: "We couldn't process that file. Try again, or upload it as a PDF." };
  }
  revalidatePath("/", "layout");
  redirect(`/profile?from=upload${note ? "&note=fallback" : ""}`);
}

export async function removeResume(form: FormData) {
  const { user } = await requireUser();
  const resumeId = z.string().uuid().parse(form.get("resumeId"));
  await deleteResume(createAdminClient(), user.id, resumeId);
  revalidatePath("/resume");
  revalidatePath("/settings");
}

export async function downloadResumeUrl(resumeId: string): Promise<string | null> {
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("resumes").select("storage_path").eq("id", resumeId).eq("user_id", user.id).maybeSingle();
  if (!data) return null;
  const { data: signed } = await createAdminClient().storage.from("resumes").createSignedUrl(data.storage_path, 60);
  return signed?.signedUrl ?? null;
}
