import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { AIProvider } from "./types";
import { SpentError } from "./types";
import { isPriced, UnpricedBackendError } from "@/lib/costs/pricing";
import { Agent } from "undici";

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
  // 61회차: 판단 자리의 모델을 **환경 변수로 갈아 볼 수 있게** 한다(기본은 그대로).
  // 우리는 2025-08 판 gpt-5 를 계속 쓰고 있었는데 그 사이 5.4·5.5·5.6·6(astra)이 나왔다.
  // 소문으로 정하지 않는다 — 같은 일을 시켜서 자로 재고 정한다.
  judgment: process.env.OPENAI_JUDGMENT_MODEL || "gpt-5",
  verification: "gpt-5-mini",
  conversation: "gpt-5-mini",
  routine: "gpt-5-mini",
};

/**
 * @param opts.judgmentModel 152회차: 판단 자리 모델을 **판마다** 바꿀 수 있게. 배치 담당(`providers/place.ts`)이
 *   이 일에 어느 자리를 앉힐지 정하면 그 이름이 여기로 온다. 안 주면 지금까지처럼 환경 변수·기본값.
 */
export function createOpenAIProvider(opts: { judgmentModel?: string } = {}): AIProvider {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set.");
  }

  // 59회차 09-08: Dev 의 코드 생성 한 판이 **30분**을 넘겼는데 Node 가 먼저 끊었다.
  // (`Request timed out. Node.js fetch timed out waiting for response headers` — undici 의 headersTimeout,
  //  그리고 더 낮은 층에서는 `terminated`.) 그러면 옆자리(anthropic)로 넘어가고 거기는 잔액이 0이라 업무가 통째로 죽는다.
  // 오래 걸리는 것은 고장이 아니다. 긴 판을 견디도록 연결의 시간을 늘리고, SDK 자신의 시간도 같이 늘린다.
  // (진짜 해법은 한 판을 작게 만드는 것이다 — 씬 빌더 한 파일이 74 KB 다. 그건 따로 손본다.)
  const LONG_MS = 20 * 60_000;
  const client = new OpenAI({
    apiKey,
    maxRetries: 5,
    timeout: LONG_MS,
    fetchOptions: {
      dispatcher: new Agent({
        headersTimeout: LONG_MS,
        bodyTimeout: LONG_MS,
        connectTimeout: 30_000,
      }),
    },
  });

  return {
    name: "openai",
    model: MODELS.judgment,

    async generateStructuredOutput({
      systemInstructions,
      input,
      images,
      schema,
      schemaName,
      maxTokens = 32000,
      tier = "judgment",
    }) {
      const model = tier === "judgment" && opts.judgmentModel ? opts.judgmentModel : MODELS[tier];

      // Same rule as the other provider: refused before the request goes out.
      // A backend with no rate spends money the company's limit cannot see.
      if (!isPriced(model)) throw new UnpricedBackendError(model);

      const response = await client.responses.parse({
        model,
        instructions: systemInstructions,
        input:
          images && images.length > 0
            ? [
                {
                  role: "user" as const,
                  content: [
                    ...images.map((b64) => ({
                      type: "input_image" as const,
                      // 163회차: 같이 보기 화면은 JPEG 로 온다(3초마다 한 장이라 작게). 앞 글자로 종류를 가른다.
                      image_url: `data:image/${b64.startsWith("/9j/") ? "jpeg" : "png"};base64,${b64}`,
                      detail: "auto" as const,
                    })),
                    { type: "input_text" as const, text: input },
                  ],
                },
              ]
            : input,
        max_output_tokens: maxTokens,
        text: { format: zodTextFormat(schema, schemaName) },
      });

      // 09-09: 실패해도 **쓴 토큰은 청구된다.** 던질 때 같이 실어 보내 장부에 남긴다.
      const spent = (why: string) =>
        new SpentError(why, model, response.usage?.input_tokens ?? 0, response.usage?.output_tokens ?? 0);

      // Reasoning models spend the output budget on thinking before they write,
      // so hitting the ceiling here looks like a complete-but-empty response
      // rather than a parse error. Named for what it is.
      if (response.status === "incomplete") {
        throw spent("MODEL_OUTPUT_TRUNCATED");
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
        throw spent("MODEL_REFUSED");
      }
      if (!response.output_parsed) {
        throw spent("MODEL_OUTPUT_UNPARSEABLE");
      }

      return {
        output: response.output_parsed,
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
        model,
        /**
         * **응답이 스스로 말한 이름** (205회차 09-22).
         * `model` 은 우리가 부른 이름이다. 둘은 같지 않을 수 있다 — 09-21 에 확인했다:
         * `deepseek-v4-flash` 와 `deepseek-chat` 은 둘 다 `deepseek-flash` 로 넘어가는 **별칭**이었다.
         * 그때 별칭이 **언제** 바뀜는지 못 알아낸 이유가 바로 이 칸이 없어서였다.
         */
        answeredBy: (response as { model?: string }).model ?? null,
      };
    },
  };
}
