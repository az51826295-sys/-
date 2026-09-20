/**
 * 무인 판 대기열을 **로키가 짠다** (203회차 09-21). 사장님: *"과제 60개를 직접 쓰지 마세요 — 종류별 개수와 비율만 주고 목록을 만들게 하세요."*
 * 무게를 섞는다(가벼움 5 : 중간 3 : 무거움 2) — 가벼운 것만 60개면 어젯밤과 같은 부하라 누수·소켓 고갈이 안 나온다.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/queue_gen.mts --n 60    → engine/docs/genesis/unattended-queue-2.json 에 **얼려** 적는다
 */
const { createOpenAIProvider } = await import("../../src/lib/providers/openai");
const { z } = await import("zod");
const { writeFileSync } = await import("node:fs");
const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const N = Number(arg("--n") ?? 60);
const light = Math.round(N * 0.5), mid = Math.round(N * 0.3), heavy = N - light - mid;

const schema = z.object({ items: z.array(z.object({
  weight: z.enum(["가벼움", "중간", "무거움"]),
  title: z.string().describe("12자 안팎. 사람이 알아볼 이름"),
  description: z.string().describe("무엇을 만들지. **HTML 한 파일**로 브라우저에서 도는 것. 조작·규칙·끝나는 조건을 적는다"),
})) });

const ai = createOpenAIProvider({ judgmentModel: "gpt-5.6-luna" });
const { output } = await ai.generateStructuredOutput({
  systemInstructions: [
    "무인 시험용 과제 목록을 짠다. 전부 **HTML 한 파일**로 브라우저에서 도는 작은 게임·도구다.",
    "**무게를 섞는 것이 목적이다** — 가벼운 것만 있으면 부하가 안 걸려 누수·고장이 안 나온다.",
    `- 가벼움 ${light}개: 규칙 2~3개, 화면 하나. (예: 반응속도 재기, 숫자 맞추기)`,
    `- 중간 ${mid}개: 규칙 5~7개, 상태가 여러 개(점수·목숨·단계). (예: 벽돌깨기, 두더지)`,
    `- 무거움 ${heavy}개: 규칙 10개 이상, 여러 화면(시작·게임·끝), 저장·단계 진행·적 여러 종류 등 **코드가 길어질 것**. (예: 플랫포머 3스테이지, 카드 덱 빌딩)`,
    "겹치지 않게. 한국어 제목.",
  ].join("\n"),
  input: `총 ${N}개. 가벼움 ${light} · 중간 ${mid} · 무거움 ${heavy}.`,
  schema, schemaName: "queue", maxTokens: 16000, tier: "judgment",
});

// **일부러 깨지는 과제 2개**를 중간에 흩어 넣는다(연속으로 몰지 않는다 — 문지기가 판을 끝내 버린다).
// 실패가 보장되지는 않는다(계획 모델이 빈 주문에서도 기준을 지어낼 수 있다) → 기록에 '실패 기대(보장 아님)' 로 적는다.
const items = output.items.map((x) => ({ ...x, expectFail: false as boolean }));
const broken = [
  { weight: "가벼움" as const, title: "[실패 기대] 빈 주문", description: ".", expectFail: true },
  { weight: "가벼움" as const, title: "[실패 기대] 모순된 주문", description: "아무 화면도 그리지 말고, 아무 입력도 받지 말고, 아무것도 보여 주지 않는 게임을 만들어. 코드도 쓰지 마.", expectFail: true },
];
items.splice(Math.floor(items.length * 0.25), 0, broken[0]);
items.splice(Math.floor(items.length * 0.7), 0, broken[1]);

const out = {
  version: "unattended-queue-2",
  frozenAt: new Date().toISOString(),
  note: "무인 판 2 의 **얼린 대기열**. 순서까지 고정한다 — 끝나고 '어느 종류에서 막혔나' 를 보려면 순서가 같아야 하고, 다음 판과도 견줄 수 있어야 한다(사장님 09-21). 실패 기대 둘은 연속으로 몰지 않았다(문지기가 3연속 실패로 판을 끝내 버린다).",
  mix: { 가벼움: items.filter((x) => x.weight === "가벼움").length, 중간: items.filter((x) => x.weight === "중간").length, 무거움: items.filter((x) => x.weight === "무거움").length, 실패기대: 2 },
  items,
};
writeFileSync("engine/docs/genesis/unattended-queue-2.json", JSON.stringify(out, null, 2) + "\n", "utf8");
console.log(`얼림: ${items.length}개 — ${JSON.stringify(out.mix)}`);
for (const [i, x] of items.entries()) console.log(`  ${String(i + 1).padStart(2)} [${x.weight}]${x.expectFail ? "[실패기대]" : ""} ${x.title}`);
