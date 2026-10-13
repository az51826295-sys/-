import { z } from "zod";
import { defaultProviders } from "@/lib/execution/shared";

/**
 * 10-13 캐릭터 글을 영어·일본어로 옮긴다(싼 자리). 게시물 한 줄(posts.ts)과
 * 캐릭터 이름·소개·인사 채우기(engine/tools/dot_i18n_fill.mts)가 같이 쓴다.
 *
 * 직역이 아니라 **그 인물이 그 언어로 말했을 때**의 글이다 — 반말 인물은 편하게, 존댓말 인물은 정중하게.
 * 실패하면 던진다. 부르는 쪽이 "번역 없이 한국어로" 넘어간다(글을 못 올리는 것보다 낫다).
 */
const pair = z.object({ en: z.string(), ja: z.string() });

export async function translatePair(text: string, who: { name: string; speech?: string; polite: boolean }, kind: string): Promise<{ en: string; ja: string }> {
  const out = await defaultProviders().ai.generateStructuredOutput({
    systemInstructions: [
      `한국어 글을 영어와 일본어로 옮긴다. 이 글은 캐릭터 "${who.name}" 의 ${kind}이다.`,
      who.speech ? `이 인물의 말투: ${who.speech}` : "",
      who.polite ? "- 정중한 말투(영어는 공손하게, 일본어는 です・ます)." : "- 편한 말투(영어는 친구끼리처럼, 일본어는 タメ口).",
      "- 직역하지 말고, 그 언어를 쓰는 사람이 SNS·메신저에 쓸 법한 자연스러운 글로. 길이는 원문과 비슷하게.",
      "- 이모지·웃음 표시는 그 언어 식으로 바꾼다(ㅋㅋ → lol / 笑). 원문에 없는 내용은 더하지 않는다.",
      "- 한국 음식·장소 고유명사는 그대로 소리 나는 대로 쓰되, 필요하면 아주 짧게 풀어 준다.",
      "", "## 답의 모양 (json)", "- `en` 영어", "- `ja` 일본어",
    ].filter(Boolean).join("\n"),
    input: text,
    schema: pair, schemaName: "dot_translate", maxTokens: 400, tier: "conversation",
  });
  return { en: out.output.en.trim(), ja: out.output.ja.trim() };
}
