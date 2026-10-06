// Usage limits for metered AI features, AI cost tracking and audit logging.
import type { SupabaseClient } from "@supabase/supabase-js";
import { planLimits, type MeteredFeature, type PlanTier } from "../config";
import type { AIUsage } from "../ai/provider";

export class UsageLimitError extends Error {}

export interface Allowance {
  plan: PlanTier;
  used: number;
  limit: number;
  credits: number;
  allowed: boolean;
}

export async function getAllowance(db: SupabaseClient, userId: string, feature: MeteredFeature): Promise<Allowance> {
  const [{ data: sub }, { data: used }] = await Promise.all([
    db.from("subscriptions").select("plan, status, credits").eq("user_id", userId).maybeSingle(),
    db.rpc("monthly_usage", { p_user: userId, p_feature: feature }),
  ]);
  const plan: PlanTier = sub?.plan === "pro" && sub.status !== "canceled" ? "pro" : "free";
  const limit = planLimits[plan][feature];
  const usedN = Number(used ?? 0);
  const credits = sub?.credits ?? 0;
  return { plan, used: usedN, limit, credits, allowed: usedN < limit || credits > 0 };
}

/** Throws UsageLimitError when the user has no allowance or credits left. Returns whether a credit will be consumed. */
export async function assertAllowance(db: SupabaseClient, userId: string, feature: MeteredFeature): Promise<{ useCredit: boolean }> {
  const a = await getAllowance(db, userId, feature);
  if (!a.allowed) {
    throw new UsageLimitError(
      `You've used all ${a.limit} ${feature === "tailor" ? "tailored applications" : feature === "resume_parse" ? "resume analyses" : "job analyses"} included in your ${a.plan} plan this month.`,
    );
  }
  return { useCredit: a.used >= a.limit };
}

export async function recordAIUsage(db: SupabaseClient, userId: string | null, feature: string, usage: AIUsage, ok = true, useCredit = false) {
  await db.from("ai_usage").insert({
    user_id: userId,
    feature,
    provider: usage.provider,
    model: usage.model,
    input_tokens: usage.inputTokens,
    output_tokens: usage.outputTokens,
    cost_usd: usage.costUsd,
    ok,
  });
  if (useCredit && ok && userId) {
    const { data: sub } = await db.from("subscriptions").select("credits").eq("user_id", userId).single();
    if (sub && sub.credits > 0) await db.from("subscriptions").update({ credits: sub.credits - 1 }).eq("user_id", userId).eq("credits", sub.credits);
  }
}

/** Record a non-AI use of a metered feature (e.g. template tailoring) so limits stay meaningful. */
export async function recordTemplateUsage(db: SupabaseClient, userId: string, feature: MeteredFeature) {
  await db.from("ai_usage").insert({ user_id: userId, feature, provider: "template", model: "none", ok: true });
}

export async function audit(
  db: SupabaseClient,
  userId: string | null,
  action: string,
  opts: { actor?: "user" | "system" | "admin"; entity?: string; entityId?: string; metadata?: Record<string, unknown> } = {},
) {
  await db.from("audit_logs").insert({
    user_id: userId,
    actor: opts.actor ?? "user",
    action,
    entity: opts.entity ?? null,
    entity_id: opts.entityId ?? null,
    metadata: opts.metadata ?? {},
  });
}
