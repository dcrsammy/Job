// Resume upload → secure storage → text extraction → parsing → profile.
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAIProvider, AIError } from "../ai/provider";
import { parseResumeWithAI } from "../resume/ai-parse";
import { extractResumeText, RESUME_MIME, validateResumeFile } from "../resume/extract-text";
import { parseResumeHeuristically } from "../resume/heuristic";
import type { ParsedResume } from "../types";
import { saveParsedResume } from "./candidate";
import { assertAllowance, audit, recordAIUsage } from "./usage";

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface UploadResult {
  resumeId: string;
  parser: ParsedResume["parser"];
  counts: { skills: number; experiences: number; educations: number };
  missing: string[];
  note?: string;
}

export async function processResumeUpload(db: SupabaseClient, userId: string, file: { name: string; size: number; bytes: Uint8Array }): Promise<UploadResult> {
  const kind = validateResumeFile(file.name, file.size, file.bytes);
  const { useCredit } = await assertAllowance(db, userId, "resume_parse");

  const hash = await sha256Hex(file.bytes);
  const resumeId = crypto.randomUUID();
  const path = `${userId}/${resumeId}.${kind}`;

  const { data: profile } = await db.from("profiles").select("resume_retention_days").eq("id", userId).single();
  const retention = profile?.resume_retention_days as number | null | undefined;
  const deleteAfter = retention ? new Date(Date.now() + retention * 86_400_000).toISOString() : null;

  const { error: upErr } = await db.storage.from("resumes").upload(path, file.bytes, { contentType: RESUME_MIME[kind], upsert: false });
  if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

  await db.from("resumes").update({ is_primary: false }).eq("user_id", userId).eq("is_primary", true);
  const { error: insErr } = await db.from("resumes").insert({
    id: resumeId,
    user_id: userId,
    storage_path: path,
    file_name: file.name.slice(0, 200),
    mime_type: RESUME_MIME[kind],
    size_bytes: file.size,
    sha256: hash,
    status: "parsing",
    is_primary: true,
    delete_after: deleteAfter,
  });
  if (insErr) {
    await db.storage.from("resumes").remove([path]);
    throw new Error(`Could not save resume: ${insErr.message}`);
  }
  await audit(db, userId, "resume.uploaded", { entity: "resume", entityId: resumeId, metadata: { kind, size: file.size } });

  try {
    const text = await extractResumeText(file.bytes, kind);
    let parsed: ParsedResume;
    let note: string | undefined;
    const provider = getAIProvider();
    if (provider) {
      try {
        const { parsed: p, usage } = await parseResumeWithAI(provider, text);
        await recordAIUsage(db, userId, "resume_parse", usage, true, useCredit);
        parsed = p;
      } catch (err) {
        if (err instanceof AIError && err.usage) await recordAIUsage(db, userId, "resume_parse", err.usage, false);
        parsed = parseResumeHeuristically(text);
        note = "AI analysis was unavailable, so we used our basic reader. Please check your profile carefully.";
      }
    } else {
      parsed = parseResumeHeuristically(text);
      await db.from("ai_usage").insert({ user_id: userId, feature: "resume_parse", provider: "heuristic", model: "none", ok: true });
    }

    await saveParsedResume(db, userId, resumeId, parsed);
    await db.from("resumes").update({ status: "parsed", raw_text: text, parsed_at: new Date().toISOString(), parse_error: null }).eq("id", resumeId);
    await db.from("resume_versions").insert({ user_id: userId, resume_id: resumeId, kind: "parsed", content: parsed });
    await audit(db, userId, "resume.parsed", { entity: "resume", entityId: resumeId, metadata: { parser: parsed.parser } });

    return {
      resumeId,
      parser: parsed.parser,
      counts: { skills: parsed.skills.length, experiences: parsed.experiences.length, educations: parsed.educations.length },
      missing: parsed.missing,
      note,
    };
  } catch (err) {
    await db.from("resumes").update({ status: "failed", parse_error: (err as Error).message.slice(0, 500) }).eq("id", resumeId);
    throw err;
  }
}

/** Remove a resume file and its row. Profile data the user confirmed stays unless they delete it too. */
export async function deleteResume(db: SupabaseClient, userId: string, resumeId: string) {
  const { data: resume } = await db.from("resumes").select("id, storage_path").eq("id", resumeId).eq("user_id", userId).maybeSingle();
  if (!resume) return;
  await db.storage.from("resumes").remove([resume.storage_path]);
  await db.from("resumes").delete().eq("id", resumeId).eq("user_id", userId);
  await audit(db, userId, "resume.deleted", { entity: "resume", entityId: resumeId });
}
