import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { AIProvider } from "./types";
import { isPriced, UnpricedBackendError } from "@/lib/costs/pricing";

/**
 * Which model does which kind of work.
 *
 * The split is measured, not guessed. Reading the ledger after 48 real calls:
 * writing deliverables was 65% of everything spent and is the thing customers
 * would pay for, while extracting what was learned from a finished review was
 * 24% on two calls — restating evidence that was handed to it.
 *
 * The routine tier is safe here for a structural reason, not an optimistic one:
 * everything routed to it produces a *proposal* a person approves before it
 * takes effect. A worse extraction wastes the manager's attention. It cannot
 * quietly become company knowledge.
 */
const MODELS: Record<
  "judgment" | "verification" | "conversation" | "routine",
  string
> = {
  judgment: "claude-opus-5",
  // Checking a claim against evidence that is already in front of it. The
  // middle model, because a verification that is wrong is caught by the person
  // who opens the link, but one that is *lazy* quietly passes bad citations.
  verification: "claude-sonnet-5",
  conversation: "claude-haiku-4-5",
  routine: "claude-haiku-4-5",
};

/**
 * Structured output only — the employee never receives free-form prose from
 * the model. Everything the model produces is validated against a schema before
 * it reaches the database or the user.
 */
export function createAnthropicProvider(): AIProvider {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set.");
  }

  // A run is many minutes of work behind each call, so a transient 429/529 is
  // worth waiting out rather than failing the whole assignment. The SDK backs
  // off between attempts.
  const client = new Anthropic({ apiKey, maxRetries: 5 });

  return {
    name: "anthropic",
    // What this provider uses when nobody says otherwise. Kept for display and
    // for callers that only want to know what they are dealing with.
    model: MODELS.judgment,

    async generateStructuredOutput({
      systemInstructions,
      input,
      images,
      schema,
      // Thinking is on by default on this model and counts against max_tokens
      // alongside the response, so budgets here are deliberately generous.
      maxTokens = 32000,
      tier = "judgment",
    }) {
      const model = MODELS[tier];

      // Refused before the request goes out, not after the bill arrives. A
      // backend with no rate spends money the company's limit cannot see, so
      // the only safe moment to stop it is before it is used at all.
      if (!isPriced(model)) throw new UnpricedBackendError(model);

      // Streamed rather than awaited in one piece: a long deliverable can run
      // past the SDK's HTTP timeout, and a truncated response is unparseable
      // JSON rather than a clean error.
      const stream = client.messages.stream({
        model,
        max_tokens: maxTokens,
        system: systemInstructions,
        messages: [
          {
            role: "user",
            content:
              images && images.length > 0
                ? [
                    ...images.map((b64) => ({
                      type: "image" as const,
                      source: {
                        type: "base64" as const,
                        media_type: "image/png" as const,
                        data: b64,
                      },
                    })),
                    { type: "text" as const, text: input },
                  ]
                : input,
          },
        ],
        output_config: { format: zodOutputFormat(schema) },
      });

      let response;
      try {
        response = await stream.finalMessage();
      } catch (error) {
        // The SDK parses inside finalMessage, so a response cut off at the
        // token ceiling surfaces as unterminated JSON. Name the real cause.
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("Unterminated") || message.includes("Failed to parse")) {
          throw new Error("MODEL_OUTPUT_TRUNCATED");
        }
        throw error;
      }

      if (response.stop_reason === "refusal") {
        throw new Error("MODEL_REFUSED");
      }
      if (response.stop_reason === "max_tokens") {
        throw new Error("MODEL_OUTPUT_TRUNCATED");
      }
      if (!response.parsed_output) {
        throw new Error("MODEL_OUTPUT_UNPARSEABLE");
      }

      return {
        output: response.parsed_output,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        model,
      };
    },
  };
}
