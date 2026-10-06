import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AnthropicProvider } from "./provider";

describe("AnthropicProvider", () => {
  it("falls back to asking for the tool when a model rejects forced tool use", async () => {
    const bodies: Record<string, unknown>[] = [];
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      bodies.push(body);
      if (body.tool_choice.type === "tool") {
        return new Response(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: 'tool_choice: type "tool" and "any" are not supported for this model.' } }), { status: 400 });
      }
      return new Response(
        JSON.stringify({ content: [{ type: "text", text: "ok" }, { type: "tool_use", name: "reply", input: { text: "hi" } }], usage: { input_tokens: 10, output_tokens: 5 }, stop_reason: "tool_use" }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const p = new AnthropicProvider("k", { quality: "model-x", fast: "model-x" }, fakeFetch);
    const r = await p.generateStructured({
      feature: "t",
      system: "s",
      prompt: "p",
      toolName: "reply",
      toolDescription: "d",
      schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
      validator: z.object({ text: z.string() }),
    });
    expect(r.data.text).toBe("hi");
    expect(bodies[1].tool_choice).toEqual({ type: "auto" });
    expect(String(bodies[1].system)).toMatch(/calling the `reply` tool/);
  });
});
