import OpenAI from "openai";
import { z } from "zod";
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
 *
 * **모양을 강제하는 방법이 다르다.** 처음에는 OpenAI 와 똑같이 `json_schema` 를
 * 보냈는데, DeepSeek 은 그것을 받지 않는다("This response_format type is
 * unavailable now"). 그래서 싼 자리로 보낸 일이 **전부 실패해서 비싼 자리로
 * 새고 있었다** — 돌기는 도니까 화면에서는 멀쩡해 보이고, 로그를 봐야 안다.
 * 싸게 하려고 만든 자리가 조용히 안 싸지는 것이 이 고장의 성질이다.
 *
 * 여기서는 `json_object` 로 받고 스키마는 **말로 붙인 뒤 우리가 검사한다.**
 * 모양이 어긋나면 던지고, 라우터가 위로 올려 보낸다 — 어긋난 것을 대충 고쳐
 * 쓰는 것이 가장 나쁘다.
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

      // 스키마를 말로 붙인다. `json_object` 모드는 "JSON 이어야 한다"만 보장하고
      // **무슨 모양인지는 보장하지 않으므로**, 모양은 여기서 알려 주고 아래에서
      // 우리가 검사한다.
      //
      // 프롬프트에 "json" 이라는 낱말이 없으면 이 모드 자체가 거절당한다.
      const shape = JSON.stringify(z.toJSONSchema(schema));
      const response = await client.chat.completions.create({
        model,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              systemInstructions +
              `\n\n---\n답은 **오직 JSON 하나**로 낸다. 설명도, 코드 울타리도 ` +
              `붙이지 않는다. 이 JSON Schema 를 그대로 따른다 (${schemaName}):\n` +
              shape,
          },
          { role: "user", content: input },
        ],
      });

      const choice = response.choices[0];
      if (choice?.finish_reason === "length") {
        throw new Error("MODEL_OUTPUT_TRUNCATED");
      }
      if (choice?.message.refusal) {
        throw new Error("MODEL_REFUSED");
      }

      const text = choice?.message.content;
      if (!text) throw new Error("MODEL_OUTPUT_UNPARSEABLE");

      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        throw new Error("MODEL_OUTPUT_UNPARSEABLE");
      }

      // 모양이 어긋나면 고쳐 쓰지 않고 던진다. 반쪽짜리를 통과시키면 빠진 칸이
      // 아래에서 `undefined` 로 조용히 흘러가고, 그건 틀린 답보다 찾기 어렵다.
      const checked = schema.safeParse(raw);
      if (!checked.success) {
        throw new Error(
          "MODEL_OUTPUT_OFF_SCHEMA: " +
            checked.error.issues
              .slice(0, 3)
              .map((i) => `${i.path.join(".")}: ${i.message}`)
              .join("; "),
        );
      }

      return {
        output: checked.data,
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
        model,
      };
    },
  };
}
