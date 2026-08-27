import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { AIProvider } from "./types";
import { isPriced, UnpricedBackendError } from "@/lib/costs/pricing";

/**
 * The same seam as the Anthropic provider, against a second vendor.
 *
 * Having two is not about preferring one. It is that a single provider is a
 * single point of failure for every employee at once — an outage, a rate limit,
 * a model deprecation, or a refusal on a subject one vendor is stricter about
 * stops the whole company rather than one run. The engine already names work by
 * tier rather than by model, so the choice of vendor is a fact about today that
 * belongs here and nowhere else.
 */
const MODELS: Record<
  "judgment" | "verification" | "conversation" | "routine",
  string
> = {
  judgment: "gpt-5",
  verification: "gpt-5-mini",
  conversation: "gpt-5-mini",
  routine: "gpt-5-mini",
};

export function createOpenAIProvider(): AIProvider {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set.");
  }

  const client = new OpenAI({ apiKey, maxRetries: 5 });

  return {
    name: "openai",
    model: MODELS.judgment,

    async generateStructuredOutput({
      systemInstructions,
      input,
      schema,
      schemaName,
      maxTokens = 32000,
      tier = "judgment",
    }) {
      const model = MODELS[tier];

      // Same rule as the other provider: refused before the request goes out.
      // A backend with no rate spends money the company's limit cannot see.
      if (!isPriced(model)) throw new UnpricedBackendError(model);

      const response = await client.responses.parse({
        model,
        instructions: systemInstructions,
        input,
        max_output_tokens: maxTokens,
        text: { format: zodTextFormat(schema, schemaName) },
      });

      // Reasoning models spend the output budget on thinking before they write,
      // so hitting the ceiling here looks like a complete-but-empty response
      // rather than a parse error. Named for what it is.
      if (response.status === "incomplete") {
        throw new Error("MODEL_OUTPUT_TRUNCATED");
      }
      // A refusal comes back as a normal completed response whose content is a
      // refusal part rather than the parsed object, so it has to be looked for
      // explicitly — otherwise it reads as "unparseable" and the manager is
      // told the model broke when in fact it declined.
      const refused = response.output.some(
        (item) =>
          "content" in item &&
          Array.isArray(item.content) &&
          item.content.some(
            (part: { type?: string }) => part?.type === "refusal",
          ),
      );
      if (refused) {
        throw new Error("MODEL_REFUSED");
      }
      if (!response.output_parsed) {
        throw new Error("MODEL_OUTPUT_UNPARSEABLE");
      }

      return {
        output: response.output_parsed,
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
        model,
      };
    },
  };
}
