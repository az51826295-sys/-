import type { DeliverableConfig } from "./definitions";

/**
 * 분석 산출물의 견본. 견본에도 **근거 못 찾음** 줄을 하나 둔다 — 이 직원이 무엇을 숨기지 않는지 보여 주는 자리다.
 */
export const anaDeliverable: DeliverableConfig = {
  type: "analysis",
  label: "Analysis",
  buildSample: () => ({
    title: "영상 분석 — 견본",
    contentMarkdown: [
      "## 요약",
      "",
      "- 발표자는 블록메시 단계에서 빛으로 길을 안내하라고 말한다.",
      "- 플레이어는 가는 방향을 보고, 대비에 눈이 간다.",
      "",
      "## 핵심 주장 (2)",
      "",
      "| 자 | 주장 | 원문 인용 | 어디서 |",
      "|---|---|---|---|",
      "| ✅ | 밝은 출구가 길을 만든다 | \"players will move toward the light\" | 12:40 |",
      "| ❌ 근거 못 찾음 | 랜드마크는 세 개가 적당하다 | \"three landmarks is the sweet spot\" | 20:05 |",
      "",
      "---",
      "",
      "**출처 자**: 인용 2개 중 원문에서 찾음 1 · 못 찾음 1. 못 찾은 줄은 믿지 마세요.",
    ].join("\n"),
  }),
};
