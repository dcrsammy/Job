"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { COUNTRY_NAMES } from "@/lib/geo";
import { INDUSTRIES } from "@/lib/matching/industries";
import { ROLE_FAMILIES } from "@/lib/matching/role-families";
import { normalizeSkillName } from "@/lib/skills/taxonomy";
import { createAdminClient } from "@/lib/supabase/admin";
import { runMatchingForUser } from "@/lib/services/matching";
import { audit } from "@/lib/services/usage";

export type ActionState = { error?: string; ok?: string } | undefined;

const str = (max: number) => z.string().trim().max(max).transform((s) => (s === "" ? null : s));
const country = z.string().refine((c) => !!COUNTRY_NAMES[c], "Unknown country");
const month = z
  .string()
  .regex(/^\d{4}-\d{2}$/)
  .transform((m) => `${m}-01`)
  .or(z.literal("").transform(() => null));

async function profileId(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], userId: string) {
  const { data } = await supabase.from("candidate_profiles").select("id").eq("user_id", userId).single();
  if (!data) throw new Error("Profile not found");
  return data.id as string;
}

function done(path = "/profile") {
  revalidatePath(path);
  revalidatePath("/dashboard");
}

export async function saveBasics(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser();
  const parsed = z
    .object({
      fullName: str(120),
      headline: str(200),
      summary: str(2000),
      baseCountry: country.or(z.literal("").transform(() => null)),
      authorized: z.array(country).max(60),
      sponsorship: z.enum(["yes", "no", "unknown"]),
      remotePreference: z.enum(["remote_only", "remote_or_hybrid", "any"]),
      salaryMin: z.string().trim().transform((s) => (s ? Number(s.replace(/[^\d]/g, "")) : null)).pipe(z.number().int().min(0).max(10_000_000).nullable()),
      salaryCurrency: z.enum(["USD", "EUR", "GBP", "NGN", "CAD"]),
      languages: z.string().max(300).transform((s) => s.split(/[,;\n]/).map((l) => l.trim().toLowerCase()).filter(Boolean).slice(0, 15)),
    })
    .safeParse({
      fullName: form.get("fullName") ?? "",
      headline: form.get("headline") ?? "",
      summary: form.get("summary") ?? "",
      baseCountry: form.get("baseCountry") ?? "",
      authorized: form.getAll("authorized").flatMap((v) => String(v).split(",")).map((v) => v.trim()).filter(Boolean),
      sponsorship: form.get("sponsorship") ?? "unknown",
      remotePreference: form.get("remotePreference") ?? "remote_only",
      salaryMin: form.get("salaryMin") ?? "",
      salaryCurrency: form.get("salaryCurrency") ?? "USD",
      languages: form.get("languages") ?? "",
    });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const p = parsed.data;
  await supabase.from("profiles").update({ full_name: p.fullName }).eq("id", user.id);
  const { error } = await supabase
    .from("candidate_profiles")
    .update({
      headline: p.headline,
      summary: p.summary,
      base_country: p.baseCountry,
      authorized_countries: p.authorized,
      needs_sponsorship: p.sponsorship === "unknown" ? null : p.sponsorship === "yes",
      remote_preference: p.remotePreference,
      salary_min: p.salaryMin,
      salary_currency: p.salaryCurrency,
      languages: p.languages,
    })
    .eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/dashboard");
  return { ok: "Saved." };
}

export async function saveFocus(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser();
  const families = form.getAll("roleFamilies").map(String).filter((f) => ROLE_FAMILIES.some((r) => r.key === f));
  const industries = form.getAll("industries").map(String).filter((f) => INDUSTRIES.some((r) => r.key === f));
  const seniority = z.enum(["intern", "junior", "mid", "senior", "lead", "principal", "executive", "unknown"]).safeParse(form.get("seniority"));
  const yearsRaw = String(form.get("years") ?? "").trim();
  const years = yearsRaw === "" ? null : Number(yearsRaw);
  if (years != null && (!Number.isFinite(years) || years < 0 || years > 60)) return { error: "Years of experience must be between 0 and 60." };
  const { data: cur } = await supabase.from("candidate_profiles").select("years_experience, seniority").eq("user_id", user.id).single();
  const patch: Record<string, unknown> = { role_families: families, industries };
  if (seniority.success && seniority.data !== cur?.seniority) Object.assign(patch, { seniority: seniority.data, seniority_provenance: "user" });
  if (years !== (cur?.years_experience == null ? null : Number(cur.years_experience))) Object.assign(patch, { years_experience: years, years_experience_provenance: "user" });
  const { error } = await supabase.from("candidate_profiles").update(patch).eq("user_id", user.id);
  if (error) return { error: error.message };
  done();
  return { ok: "Saved." };
}

export async function addSkill(form: FormData) {
  const { supabase, user } = await requireUser();
  const names = String(form.get("name") ?? "")
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= 60)
    .slice(0, 20);
  if (!names.length) return;
  const pid = await profileId(supabase, user.id);
  const rows = names.map((name) => ({ user_id: user.id, candidate_profile_id: pid, name, normalized: normalizeSkillName(name), provenance: "user" }));
  await supabase.from("candidate_skills").upsert(rows, { onConflict: "candidate_profile_id,normalized", ignoreDuplicates: true });
  done();
}

export async function confirmSkill(form: FormData) {
  const { supabase, user } = await requireUser();
  await supabase.from("candidate_skills").update({ provenance: "user" }).eq("id", z.string().uuid().parse(form.get("id"))).eq("user_id", user.id);
  done();
}

export async function removeSkill(form: FormData) {
  const { supabase, user } = await requireUser();
  await supabase.from("candidate_skills").delete().eq("id", z.string().uuid().parse(form.get("id"))).eq("user_id", user.id);
  done();
}

const Experience = z.object({
  id: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
  title: z.string().trim().min(1, "Add a job title.").max(200),
  employer: z.string().trim().min(1, "Add the employer.").max(200),
  location: str(200),
  start: month,
  end: month,
  current: z.boolean(),
  highlights: z.string().max(8000).transform((s) => s.split("\n").map((l) => l.replace(/^[-•*]\s*/, "").trim()).filter(Boolean).slice(0, 15)),
  skills: z.string().max(1000).transform((s) => s.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 30)),
});

export async function saveExperience(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser();
  const parsed = Experience.safeParse({
    id: form.get("id") ?? "",
    title: form.get("title") ?? "",
    employer: form.get("employer") ?? "",
    location: form.get("location") ?? "",
    start: form.get("start") ?? "",
    end: form.get("end") ?? "",
    current: form.get("current") === "on",
    highlights: form.get("highlights") ?? "",
    skills: form.get("skills") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const e = parsed.data;
  if (e.start && e.end && !e.current && e.end < e.start) return { error: "The end date is before the start date." };
  const row = {
    title: e.title,
    employer: e.employer,
    location: e.location,
    start_date: e.start,
    end_date: e.current ? null : e.end,
    is_current: e.current,
    highlights: e.highlights,
    skills: e.skills,
    provenance: "user",
  };
  if (e.id) {
    const { error } = await supabase.from("experiences").update(row).eq("id", e.id).eq("user_id", user.id);
    if (error) return { error: error.message };
  } else {
    const pid = await profileId(supabase, user.id);
    const { count } = await supabase.from("experiences").select("id", { count: "exact", head: true }).eq("user_id", user.id);
    const { error } = await supabase.from("experiences").insert({ ...row, user_id: user.id, candidate_profile_id: pid, sort_order: count ?? 0 });
    if (error) return { error: error.message };
  }
  await recomputeYears(supabase, user.id);
  done();
  return { ok: "Saved." };
}

async function recomputeYears(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], userId: string) {
  const { yearsFromExperiences } = await import("@/lib/matching/engine");
  const { data: prof } = await supabase.from("candidate_profiles").select("years_experience_provenance").eq("user_id", userId).single();
  if (prof?.years_experience_provenance === "user") return;
  const { data: exps } = await supabase.from("experiences").select("start_date, end_date, is_current").eq("user_id", userId);
  const years = yearsFromExperiences((exps ?? []).map((x) => ({ startDate: x.start_date, endDate: x.end_date, isCurrent: x.is_current })));
  await supabase.from("candidate_profiles").update({ years_experience: years, years_experience_provenance: years == null ? null : "inferred" }).eq("user_id", userId);
}

export async function deleteExperience(form: FormData) {
  const { supabase, user } = await requireUser();
  await supabase.from("experiences").delete().eq("id", z.string().uuid().parse(form.get("id"))).eq("user_id", user.id);
  await recomputeYears(supabase, user.id);
  done();
}

const Education = z.object({
  id: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
  kind: z.enum(["degree", "certification", "course"]),
  institution: z.string().trim().min(1, "Add the institution or issuer.").max(200),
  qualification: str(200),
  field: str(200),
  level: z.enum(["secondary", "associate", "bachelor", "master", "doctorate", "other", ""]).transform((v) => (v === "" ? null : v)),
  end: month,
});

export async function saveEducation(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser();
  const parsed = Education.safeParse({
    id: form.get("id") ?? "",
    kind: form.get("kind") ?? "degree",
    institution: form.get("institution") ?? "",
    qualification: form.get("qualification") ?? "",
    field: form.get("field") ?? "",
    level: form.get("level") ?? "",
    end: form.get("end") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const e = parsed.data;
  const row = { kind: e.kind, institution: e.institution, qualification: e.qualification, field: e.field, level: e.level, end_date: e.end, provenance: "user" };
  if (e.id) {
    const { error } = await supabase.from("educations").update(row).eq("id", e.id).eq("user_id", user.id);
    if (error) return { error: error.message };
  } else {
    const pid = await profileId(supabase, user.id);
    const { error } = await supabase.from("educations").insert({ ...row, user_id: user.id, candidate_profile_id: pid });
    if (error) return { error: error.message };
  }
  done();
  return { ok: "Saved." };
}

export async function deleteEducation(form: FormData) {
  const { supabase, user } = await requireUser();
  await supabase.from("educations").delete().eq("id", z.string().uuid().parse(form.get("id"))).eq("user_id", user.id);
  done();
}

export async function confirmProfile() {
  const { supabase, user } = await requireUser();
  await supabase.from("candidate_profiles").update({ confirmed_at: new Date().toISOString() }).eq("user_id", user.id);
  await supabase.from("profiles").update({ onboarding_completed: true }).eq("id", user.id);
  await audit(createAdminClient(), user.id, "profile.confirmed");
  await runMatchingForUser(createAdminClient(), user.id);
  revalidatePath("/", "layout");
  redirect("/jobs?from=profile");
}
