/**
 * **연출이 판마다 달라지나** (149회차). 같은 코드에 다른 주문을 주고 AI 가 고른 값을 본다.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/look_probe.mts
 * 이게 다 같은 값으로 나오면 판단이 아니라 여전히 상수다.
 */
import { z } from "zod";
const { lookSchema, safeLook, lookLine } = await import("../../src/lib/video/look");
const { defaultProviders } = await import("../../src/lib/execution/shared");
const ai = defaultProviders().ai;
const ORDERS = [
  ["광고", "로키를 알리는 15초 광고. 눈길을 확 끌어야 하고 글자는 한두 마디씩만."],
  ["설명", "기후변화가 농업에 미치는 영향을 60초로 차분히 설명. 장면마다 본문 세 줄씩."],
  ["보고", "OWASP Top 10 2021 보안 교육용 60초. 항목 코드와 출처 쪽수까지 화면에 박아야 한다."],
];
const schema = z.object({ look: lookSchema });
for (const [name, order] of ORDERS) {
  const r = await ai.generateStructuredOutput({
    systemInstructions:
      "너는 영상 편집자다. **`look` 은 이 판의 연출이다.** 무엇을 만드는 판인지 보고 정해라 — " +
      "짧고 눈길을 끌어야 하면 글자를 크게·템포를 짧게, 차분히 가르치는 판이면 글자를 적당히·쉬는 시간을 길게. " +
      "줄이 많으면 본문을 줄이고 줄 간격을 벌려라. 읽을 거리가 길면 왼쪽 정렬, 한 마디짜리는 가운데. why 에 한 줄.",
    input: `이 판의 주문:\n${order}`,
    schema, schemaName: "look_only", maxTokens: 4000, tier: "judgment",
  });
  const l = safeLook(r.output.look);
  console.log(`\n[${name}] ${order.slice(0, 34)}…`);
  console.log("  " + lookLine(l).replace("\n  ", "\n    "));
}
