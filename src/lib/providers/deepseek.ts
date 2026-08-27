import OpenAI from "openai";
// Chat Completions takes `zodResponseFormat`; `zodTextFormat` is the
// Responses-API shape and silently fails the type check here.
import { zodResponseFormat } from "openai/helpers/zod";
import type { AIProvider } from "./types";
import { isPriced, UnpricedBackendError } from "@/lib/costs/pricing";

/**
 * The cheap seat.
 *
 * DeepSeek speaks the OpenAI wire format, so this is the same client pointed at
 * a different base URL rather than a third integration to maintain.
 *
 * It exists for the tiers where being cheaper matters more than being best:
 * conversation, and restating evidence that is already in the input. Those are
 * safe to cheapen for a structural reason rather than an optimistic one —
 * neither writes anything down as a result. What this provider must never be
 * given is `judgment`, and the model table below simply has no entry for it.
 */
const MODELS: Partial<Record<
  "judgment" | "verification" | "conversation" | "routine",
  string
>> = {
  conversation: "deepseek-chat",
  routine: "deepseek-chat",
  verification: "deepseek-chat",
  // judgment is deliberately absent. See the router.
};

export function createDeepSeekProvider(): AIProvider {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY is not set.");
  }

  const client = new OpenAI({
    apiKey,
    baseURL: "https://api.deepseek.com/v1",
    maxRetries: 5,
  });

  return {
    name: "deepseek",
    model: MODELS.conversation as string,

    async generateStructuredOutput({
      systemInstructions,
      input,
      schema,
      schemaName,
      maxTokens = 8000,
      tier = "conversation",
    }) {
      const model = MODELS[tier];
      if (!model) {
        // Reached only if the router sends work here that was never meant for
        // it. Named loudly rather than silently downgraded: quietly answering
        // a judgment call on the cheap seat is the failure this whole tier
        // split exists to prevent.
        throw new Error(`deepseek is not configured for tier "${tier}"`);
      }
      if (!isPriced(model)) throw new UnpricedBackendError(model);

      const response = await client.chat.completions.parse({
        model,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: systemInstructions },
          { role: "user", content: input },
        ],
        response_format: zodResponseFormat(schema, schemaName),
      });

      const choice = response.choices[0];
      if (choice?.finish_reason === "length") {
        throw new Error("MODEL_OUTPUT_TRUNCATED");
      }
      if (choice?.message.refusal) {
        throw new Error("MODEL_REFUSED");
      }
      if (!choice?.message.parsed) {
        throw new Error("MODEL_OUTPUT_UNPARSEABLE");
      }

      return {
        output: choice.message.parsed,
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
        model,
      };
    },
  };
}
