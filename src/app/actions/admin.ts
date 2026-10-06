"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ingestSource, type SourceRow } from "@/lib/services/ingest";
import { enqueueMatchingForActiveUsers, processTasks } from "@/lib/services/worker";
import { audit } from "@/lib/services/usage";

export type AdminState = { error?: string; ok?: string } | undefined;

export async function toggleSource(form: FormData) {
  const { user } = await requireAdmin();
  const id = z.string().uuid().parse(form.get("id"));
  const enabled = form.get("enabled") === "true";
  const db = createAdminClient();
  await db.from("job_sources").update({ enabled, consecutive_failures: 0 }).eq("id", id);
  await audit(db, user.id, "admin.source_toggled", { actor: "admin", entity: "job_source", entityId: id, metadata: { enabled } });
  revalidatePath("/admin");
}

export async function runSourceNow(_: AdminState, form: FormData): Promise<AdminState> {
  const { user } = await requireAdmin();
  const id = z.string().uuid().parse(form.get("id"));
  const db = createAdminClient();
  const { data: source } = await db.from("job_sources").select("*").eq("id", id).single();
  if (!source) return { error: "Source not found" };
  const r = await ingestSource(db, source as SourceRow);
  await audit(db, user.id, "admin.source_run", { actor: "admin", entity: "job_source", entityId: id, metadata: { status: r.status } });
  if (r.status !== "failed") await enqueueMatchingForActiveUsers(db);
  revalidatePath("/admin");
  return r.status === "failed" ? { error: r.errors[0] } : { ok: `${r.fetched} fetched, ${r.inserted} new, ${r.updated} updated, ${r.deactivated} closed` };
}

const NewSource = z.object({
  kind: z.enum(["greenhouse", "lever", "ashby", "remotive", "arbeitnow", "remoteok", "adzuna", "jsonld"]),
  name: z.string().trim().min(2).max(80),
  key: z.string().trim().max(2000),
  official: z.boolean(),
  interval: z.coerce.number().int().min(60).max(10080),
});

export async function addSource(_: AdminState, form: FormData): Promise<AdminState> {
  const { user } = await requireAdmin();
  const p = NewSource.safeParse({
    kind: form.get("kind"),
    name: form.get("name"),
    key: form.get("key") ?? "",
    official: form.get("official") === "on",
    interval: form.get("interval") ?? 360,
  });
  if (!p.success) return { error: p.error.issues[0].message };
  const { kind, name, key, official, interval } = p.data;
  let config: Record<string, unknown> = {};
  if (kind === "greenhouse" || kind === "ashby") config = { board: key };
  else if (kind === "lever") config = { company: key };
  else if (kind === "jsonld") config = { urls: key.split(/\s+/).filter((u) => u.startsWith("https://")), employer: name };
  else if (kind === "adzuna") config = { country: key || "gb", what: "remote" };
  if ((kind === "greenhouse" || kind === "ashby" || kind === "lever") && !/^[A-Za-z0-9_.-]+$/.test(key)) return { error: "Enter the board name exactly as it appears in the job board URL." };
  const slug = `${kind.slice(0, 2)}-${(key || name).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`;
  const db = createAdminClient();
  const { error } = await db.from("job_sources").insert({ kind, name, slug, config, is_official: official, min_interval_minutes: interval, enabled: true });
  if (error) return { error: error.code === "23505" ? "That source already exists." : error.message };
  await audit(db, user.id, "admin.source_added", { actor: "admin", metadata: { kind, slug } });
  revalidatePath("/admin");
  return { ok: `Added ${name}. Run it now to fetch jobs.` };
}

export async function runQueueNow() {
  await requireAdmin();
  await processTasks(createAdminClient(), 3);
  revalidatePath("/admin");
}
