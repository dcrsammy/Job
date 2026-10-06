import { NextResponse } from "next/server";
import { z } from "zod";
import { AnthropicProvider } from "@/lib/ai/provider";
import { createClient } from "@/lib/supabase/server";

// Admin-only: checks that the Anthropic key works with each configured model.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const key = process.env.ANTHROPIC_API_KEY;
  const models = { quality: process.env.AI_MODEL ?? "claude-sonnet-5-5", fast: process.env.AI_MODEL_FAST ?? "claude-haiku-4-5-20251001" };
  if (!key) return NextResponse.json({ keyPresent: false, models });

  const results: Record<string, unknown> = {};
  for (const [tier, model] of Object.entries(models)) {
    const provider = new AnthropicProvider(key, { quality: model, fast: model });
    const started = Date.now();
    try {
      const r = await provider.generateStructured({
        feature: "check",
        system: "Reply using the tool.",
        prompt: "Say hello.",
        toolName: "reply",
        toolDescription: "Reply",
        schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
        validator: z.object({ text: z.string() }),
        maxTokens: 50,
        tier: "fast",
      });
      results[tier] = { model, ok: true, ms: Date.now() - started, reply: r.data.text };
    } catch (err) {
      results[tier] = { model, ok: false, ms: Date.now() - started, error: (err as Error).message };
    }
  }
  return NextResponse.json({ keyPresent: true, keyPrefix: key.slice(0, 10), results });
}
