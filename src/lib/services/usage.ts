// Usage limits for metered AI features, AI cost tracking and audit logging.
import type { SupabaseClient } from "@supabase/supabase-js";
import { effectivePlan, planInfo, planLimits, type MeteredFeature, type PlanTier } from "../config";
import type { AIUsage } from "../ai/provider";

export class UsageLimitError extends Error {}

export const FEATURE_LABEL: Record<MeteredFeature, string> = {
  resume_parse: "resume analyses",
  tailor: "tailored applications",
  job_analysis: "job analyses",
  employer_questions: "employer-question answers",
  interview_prep: "interview preps",
  follow_up: "follow-up emails",
};

function requiredPlanFor(feature: MeteredFeature): string {
  return planLimits.pro[feature] > 0 ? "Pro" : "Premium";
}

export interface Allowance {
  plan: PlanTier;
  used: number;
  limit: number;
  credits: number;
  allowed: boolean;
}

export async function getAllowance(db: SupabaseClient, userId: string, feature: MeteredFeature): Promise<Allowance> {
  const [{ data: sub }, { data: used }] = await Promise.all([
    db.from("subscriptions").select("plan, status, credits, current_period_end").eq("user_id", userId).maybeSingle(),
    db.rpc("monthly_usage", { p_user: userId, p_feature: feature }),
  ]);
  const plan = effectivePlan(sub);
  const limit = planLimits[plan][feature];
  const usedN = Number(used ?? 0);
  const credits = sub?.credits ?? 0;
  // Credits top up a plan's allowance; they don't unlock features the plan doesn't include.
  return { plan, used: usedN, limit, credits, allowed: usedN < limit || (limit > 0 && credits > 0) };
}

/** Throws UsageLimitError when the user has no allowance or credits left. Returns whether a credit will be consumed. */
export async function assertAllowance(db: SupabaseClient, userId: string, feature: MeteredFeature): Promise<{ useCredit: boolean }> {
  const a = await getAllowance(db, userId, feature);
  if (!a.allowed) {
    throw new UsageLimitError(
      a.limit === 0
        ? `This isn't included in the ${planInfo[a.plan].name} plan. ${requiredPlanFor(feature)} includes it.`
        : `You've used all ${a.limit} ${FEATURE_LABEL[feature]} included in your ${planInfo[a.plan].name} plan this month.`,
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

/** The user's current plan (paid plans only while the subscription is active). */
export async function getPlan(db: SupabaseClient, userId: string): Promise<PlanTier> {
  const { data: sub } = await db.from("subscriptions").select("plan, status, current_period_end").eq("user_id", userId).maybeSingle();
  return effectivePlan(sub);
}
