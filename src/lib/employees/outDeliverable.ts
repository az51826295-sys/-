import type { DeliverableConfig } from "./definitions";

/** 외주 그림 산출물의 견본. 누가 만들었는지와 자에 걸린 줄을 보인다. */
export const outDeliverable: DeliverableConfig = {
  type: "image",
  label: "Outsourced Image",
  buildSample: () => ({
    title: "로고 후보 — 견본",
    contentMarkdown: [
      "## 로고 후보", "",
      "**이 그림은 로키가 아니라 gpt-image-2 가 만들었어요.** 로키는 주문을 옮기고 결과를 잰 것뿐이에요.", "",
      "그림 AI 에 준 주문: `A simple flat logo mark of a speech bubble turning into a file icon, two colors, plain background`", "",
      "## 자 (2/3)", "| 자 | 결과 | 메모 |", "|---|---|---|",
      "| 장수_주문대로 | ✅ | 3장 (주문 3) |", "| 빈_그림_없음 | ✅ | 모두 10KB 이상 |", "| 화소_주문대로 | ❌ | 1장이 1024x1024 가 아님 |",
      "", "예쁜가·쓸 만한가는 자가 없어요 — 사장님 눈으로.",
    ].join("\n"),
  }),
};
