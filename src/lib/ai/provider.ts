// Provider-agnostic AI layer. Application code calls `generateStructured` and
// never talks to a vendor SDK directly, so providers can be swapped by adding
// a class that implements AIProvider and registering it in getAIProvider().
import type { ZodType } from "zod";

export interface JsonSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  [k: string]: unknown;
}

export interface StructuredRequest<T> {
  /** Metered feature name, recorded in ai_usage (e.g. "resume_parse"). */
  feature: string;
  system: string;
  prompt: string;
  /** Name + JSON schema the model must fill in. */
  toolName: string;
  toolDescription: string;
  schema: JsonSchema;
  /** Runtime validation of the model output. */
  validator: ZodType<T>;
  maxTokens?: number;
  /** "fast" uses the cheaper model; "quality" the stronger one. */
  tier?: "fast" | "quality";
  temperature?: number;
}

export interface AIUsage {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface StructuredResult<T> {
  data: T;
  usage: AIUsage;
}

export interface AIProvider {
  name: string;
  generateStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>>;
}

export class AIError extends Error {
  constructor(
    message: string,
    public usage?: AIUsage,
  ) {
    super(message);
  }
}

// USD per million tokens. Keep in sync with the provider's price list.
export const PRICES: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

export function costFor(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICES[model];
  if (!p) return 0;
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

// ---------------------------------------------------------------------------
// Anthropic (Claude) — Messages API with a forced tool call for structured output
// ---------------------------------------------------------------------------
export class AnthropicProvider implements AIProvider {
  name = "anthropic";
  constructor(
    private apiKey: string,
    private models: { quality: string; fast: string },
    private fetchImpl: typeof fetch = fetch,
  ) {}

  async generateStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const model = this.models[req.tier ?? "quality"];
    const body = {
      model,
      max_tokens: req.maxTokens ?? 4096,
      temperature: req.temperature ?? 0.2,
      system: req.system,
      tools: [{ name: req.toolName, description: req.toolDescription, input_schema: req.schema }],
      tool_choice: { type: "tool", name: req.toolName },
      messages: [{ role: "user", content: req.prompt }],
    };

    let res: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await this.fetchImpl("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      });
      if (res.status !== 429 && res.status !== 529 && res.status < 500) break;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
    if (!res || !res.ok) {
      const text = res ? await res.text().catch(() => "") : "";
      throw new AIError(`Claude API error ${res?.status}: ${text.slice(0, 300)}`);
    }

    const json = (await res.json()) as {
      content: { type: string; name?: string; input?: unknown }[];
      usage?: { input_tokens: number; output_tokens: number };
      stop_reason?: string;
    };
    const usage: AIUsage = {
      provider: this.name,
      model,
      inputTokens: json.usage?.input_tokens ?? 0,
      outputTokens: json.usage?.output_tokens ?? 0,
      costUsd: costFor(model, json.usage?.input_tokens ?? 0, json.usage?.output_tokens ?? 0),
    };
    const block = json.content.find((b) => b.type === "tool_use" && b.name === req.toolName);
    if (!block) throw new AIError("Model did not return structured output", usage);
    if (json.stop_reason === "max_tokens") throw new AIError("Model output was cut off (max_tokens)", usage);
    const parsed = req.validator.safeParse(block.input);
    if (!parsed.success) {
      throw new AIError(`Model output failed validation: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`, usage);
    }
    return { data: parsed.data, usage };
  }
}

/** Returns the configured provider, or null when AI is not configured (heuristic fallbacks are used). */
export function getAIProvider(env: Record<string, string | undefined> = process.env): AIProvider | null {
  const provider = (env.AI_PROVIDER ?? "anthropic").toLowerCase();
  if (provider === "none") return null;
  if (provider === "anthropic") {
    if (!env.ANTHROPIC_API_KEY) return null;
    return new AnthropicProvider(env.ANTHROPIC_API_KEY, {
      quality: env.AI_MODEL ?? "claude-sonnet-5-5",
      fast: env.AI_MODEL_FAST ?? "claude-haiku-4-5-20251001",
    });
  }
  throw new Error(`Unknown AI_PROVIDER "${provider}"`);
}
