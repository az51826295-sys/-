#!/usr/bin/env node
/**
 * rookery-director — 손님 컴퓨터에서 도는 판단 엔진 MCP 서버(설치용 입구, 11-21).
 * 본체는 저장소의 `src/lib/director/server.ts` 를 그대로 묶는다(두 벌로 베끼지 않는다).
 *
 * 판단자는 손님의 OpenAI 열쇠(OPENAI_API_KEY)로 부른다 — 우리 서버를 거치지 않는다(BYOK).
 */
import { homedir } from "node:os";
import { join } from "node:path";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { startDirectorServer } from "../../../src/lib/director/server";
import { costOf, isPriced } from "../../../src/lib/costs/pricing";

if (process.argv.includes("--version")) { console.error("rookery-director 0.1.0"); process.exit(0); }

async function makeBrain(model: string) {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!isPriced(model)) throw new Error(`판단자 ${model} 의 값표가 없다 — DIRECTOR_BRAIN 을 확인`);
  const client = new OpenAI({ maxRetries: 2 });
  return {
    name: "openai", model,
    async generateStructuredOutput(p: { systemInstructions: string; input: string; images?: string[]; schema: never; schemaName: string; maxTokens?: number }) {
      const r = await client.responses.parse({
        model, instructions: p.systemInstructions,
        input: p.images?.length
          ? [{ role: "user" as const, content: [...p.images.map((b64) => ({ type: "input_image" as const, image_url: `data:image/png;base64,${b64}`, detail: "auto" as const })), { type: "input_text" as const, text: p.input }] }]
          : p.input,
        max_output_tokens: p.maxTokens ?? 16000,
        text: { format: zodTextFormat(p.schema, p.schemaName) },
      });
      if (r.status === "incomplete") throw new Error("판단자 출력이 잘렸다(MODEL_OUTPUT_TRUNCATED)");
      if (!r.output_parsed) throw new Error("판단자 출력을 못 읽었다");
      return { output: r.output_parsed, model, inputTokens: r.usage?.input_tokens ?? 0, outputTokens: r.usage?.output_tokens ?? 0 };
    },
  } as never;
}

startDirectorServer({
  home: process.env.DIRECTOR_HOME || join(homedir(), ".rookery", "director"),
  brainModel: process.env.DIRECTOR_BRAIN || "gpt-5.6-luna",
  preset: process.env.DIRECTOR_PRESET,
  makeBrain,
  meter: (u) => costOf({ backend: u.model, inputTokens: u.inputTokens, outputTokens: u.outputTokens }),
  // 판매 주소는 license.ts 의 SALE 한 곳. 환경변수는 시험용 덮어쓰기.
  license: { validateUrl: process.env.DIRECTOR_LICENSE_VALIDATE_URL, buyUrl: process.env.DIRECTOR_BUY_URL },
  licenseKey: process.env.ROOKERY_LICENSE,
  version: "0.1.0",
});
