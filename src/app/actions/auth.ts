"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env";

export type FormState = { error?: string; message?: string } | undefined;

const Credentials = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(8, "Use at least 8 characters for your password."),
});

async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : publicEnv().siteUrl;
}

function safeNext(next: FormDataEntryValue | null) {
  const n = typeof next === "string" ? next : "";
  return n.startsWith("/") && !n.startsWith("//") ? n : "/dashboard";
}

export async function signIn(_: FormState, form: FormData): Promise<FormState> {
  const parsed = Credentials.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: error.message === "Invalid login credentials" ? "That email and password don't match an account." : error.message };
  redirect(safeNext(form.get("next")));
}

export async function signUp(_: FormState, form: FormData): Promise<FormState> {
  const parsed = Credentials.extend({ fullName: z.string().trim().max(120).optional() }).safeParse({
    email: form.get("email"),
    password: form.get("password"),
    fullName: form.get("fullName") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (form.get("consent") !== "on") return { error: "Please agree to how we use your data to continue." };
  const choice = String(form.get("plan") ?? "free");
  const planChoice = choice === "pro" || choice === "premium" ? choice : "free";
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { emailRedirectTo: `${await origin()}/auth/confirm?next=/resume`, data: { full_name: parsed.data.fullName, plan_choice: planChoice } },
  });
  if (error) return { error: error.message };
  if (data.session) redirect(planChoice === "free" ? "/resume" : "/resume?plan=requested");
  return {
    message:
      planChoice === "free"
        ? "Check your email for a link to confirm your account."
        : "Check your email for a link to confirm your account. You'll start on Basic while we activate your plan.",
  };
}

export async function signInWithGoogle(form: FormData) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${await origin()}/auth/callback?next=${encodeURIComponent(safeNext(form.get("next")))}` },
  });
  if (error || !data.url) redirect("/login?error=oauth");
  redirect(data.url);
}

export async function requestPasswordReset(_: FormState, form: FormData): Promise<FormState> {
  const email = z.string().trim().email().safeParse(form.get("email"));
  if (!email.success) return { error: "Enter a valid email address." };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email.data, { redirectTo: `${await origin()}/auth/confirm?next=/reset-password` });
  // Same message whether or not the account exists.
  return { message: "If an account exists for that email, we've sent a link to reset your password." };
}

export async function updatePassword(_: FormState, form: FormData): Promise<FormState> {
  const pw = z.string().min(8).safeParse(form.get("password"));
  if (!pw.success) return { error: "Use at least 8 characters for your password." };
  if (form.get("password") !== form.get("confirm")) return { error: "The two passwords don't match." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: pw.data });
  if (error) return { error: error.message };
  redirect("/dashboard?password=updated");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
