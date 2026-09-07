import type { DeliverableConfig } from "./definitions";

/** 영상 산출물의 견본. 검사 줄에 실패 하나를 두어 무엇을 숨기지 않는지 보인다. */
export const vidDeliverable: DeliverableConfig = {
  type: "video",
  label: "Video",
  buildSample: () => ({
    title: "설명 영상 — 견본",
    contentMarkdown: [
      "## 우리 게임 첫 레벨, 60초로",
      "",
      "길이 58.3초 · 장면 5 · 1280×720 · 소리 있음",
      "",
      "## 대본",
      "",
      "| # | 자막 | 읽은 말 | 초 |",
      "|---|---|---|---|",
      "| 1 | 시작·도전·목표 | 첫 레벨은 세 구역이에요. | 9.8 |",
      "| 2 | 6 m 랜드마크 | 시작점에서 보이는 빨간 기둥이 목표예요. | 11.2 |",
      "",
      "## 검사 결과 — 통과 5 · 실패 1",
      "",
      "- ✅ 길이_목표안 — 실측 58.3s, 목표 60s",
      "- ❌ 첫장면_3초안 — 첫 장면 9.8s",
    ].join("\n"),
  }),
};
