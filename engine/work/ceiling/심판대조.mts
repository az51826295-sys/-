/**
 * **심판 프롬프트 대조군** (228회차 09-30). 모델은 쓰지만 판은 안 만든다(심판 호출 N번만).
 *   npx tsx engine/tools/rookery_env.mts engine/work/ceiling/심판대조.mts [판수=3]
 *
 * 4판에서 사실에는 `money 300→140→160`(돈이 오른 적 있음 = 적을 죽였다)이 또렷이 잡혔는데
 * 심판은 기준 15개 중 **맞음 4 · 모름 11** 로 닫았다. 사실이 있어도 **읽는 법을 모르면 안 쓴다.**
 *
 * 그래서 심판 지시문에 "숫자 자취는 증거다" 를 넣었다. 그게 값을 하는지 보려면 **대조군**이 있어야 한다
 * ([[prompt-credit-needs-a-control]]). 여기서는 **4판이 실제로 본 사실 그대로**를 두 지시문에 똑같이 먹인다 —
 * 판도 같고 사실도 같고 다른 것은 지시문뿐이다. 그림은 저장이 안 돼 양쪽 다 없다(같은 조건).
 *
 * 한 번만 재면 흔들림이 안 보인다([[measure-once-hides-variance]]) — 판마다 N번씩 돌린다.
 */
import { readFileSync } from "node:fs";
import { z } from "zod";
import { defaultProviders } from "../../../src/lib/execution/shared";

const 판수 = Number(process.argv[2] ?? 3);
const cj = JSON.parse(readFileSync("engine/work/ceiling/결과4.json", "utf8")) as {
  criteria: { id: string; when: string; then: string }[];
  loop: { facts: { did: string[]; text: string; numberTrail: Record<string, string[]>; resumeProbe: string; movesAfterPlay: number; consoleErrors: string[]; blankAtStart: boolean; changesOnTap: boolean; changesOnKeys: boolean; movesByItself: boolean } };
};
const f = cj.loop.facts;

// 4판이 실제로 본 사실 그대로(= factLines 가 만든 줄).
const 사실줄 = [
  `콘솔 오류 ${f.consoleErrors.length}개`,
  `첫 화면 ${f.blankAtStart ? "비어 있음(단색)" : "그려짐"}`,
  `가만히 두면 ${f.movesByItself ? "움직임" : "안 움직임"}`,
  `가운데를 누르면 ${f.changesOnTap ? "화면이 바뀜" : "안 바뀜"}`,
  `방향키·스페이스를 치면 ${f.changesOnKeys ? "화면이 바뀜" : "안 바뀜"}`,
  `놀아 본 뒤 그대로 두면 ${f.movesAfterPlay === 2 ? "계속 바뀜(도는 중)" : "안 바뀜(멈췄거나 끝난 화면)"}`,
  `해 본 조작: ${f.did.join(" → ")}`,
  `놀아 보는 동안 움직인 숫자: ${Object.entries(f.numberTrail).filter(([, v]) => v.length > 1).map(([k, v]) => `${k} ${v.join("→")}`).join(" · ")}`,
  `끝까지 안 움직인 숫자: ${Object.entries(f.numberTrail).filter(([, v]) => v.length === 1).map(([k, v]) => `${k} ${v[0]}`).join(" · ")}`,
  `놀아 본 뒤 화면 글자: ${f.text}`,
];

const 공통 = [
  "너는 웹 게임(HTML 한 파일)을 **실제로 돌려 본 결과**를 놓고 확인 목록을 대 보는 심판자다.",
  "규칙:",
  "- 본 것만 말한다. 사실로 확인되는 기준만 met. 확인할 수 없는 것은 unknown 이지 met 이 아니다.",
  "- 콘솔 오류가 있으면 그 오류가 무엇을 깨뜨리는지 broken 에 적는다.",
  "- done 은 unmet 과 broken 이 둘 다 비었을 때만 true.",
];
const 옛지시문 = 공통.join("\n");
const 새지시문 = [
  ...공통,
  "- **'놀아 보는 동안 움직인 숫자' 는 증거다.** 돈이 300→140→160 처럼 **오른 적이 있으면** 무언가를 잡아 보상을 받았다는 뜻이고(보상·점수 기준 met),",
  "  목숨이 10→8 로 줄었으면 적이 끝까지 갔다는 뜻이며(목숨 감소 기준 met), 웨이브 숫자가 1→2 로 바뀌었으면 웨이브가 넘어간 것이다.",
  "- **'끝까지 안 움직인 숫자' 도 증거다.** 타워를 놓았는데 돈이 **줄기만 하고 한 번도 안 올랐다면** 적을 한 마리도 못 죽인 것이다 —",
  "  그건 unknown 이 아니라 **unmet** 이다. 숫자가 아예 안 잡혔을 때만 unknown 이다.",
].join("\n");

const 꼴 = z.object({
  met: z.array(z.string()), unmet: z.array(z.object({ id: z.string(), why: z.string() })),
  unknown: z.array(z.string()), broken: z.array(z.string()), done: z.boolean(), toPerson: z.string(),
});
const input =
  `## 주문\n타워 디펜스 (화면 셋·웨이브 10·타워 3종)\n\n## 기기\n데스크톱\n\n` +
  `## 확인 목록\n${cj.criteria.map((c) => `- [${c.id}] ${c.when} → ${c.then}`).join("\n")}\n\n` +
  `## 돌려 본 사실\n${사실줄.map((l) => `- ${l}`).join("\n")}\n`;

const { ai } = defaultProviders(null);
for (const [이름, 지시문] of [["옛 지시문(대조군)", 옛지시문], ["새 지시문", 새지시문]] as const) {
  const 맞음수: number[] = [], 모름수: number[] = [], 틀림수: number[] = [];
  for (let i = 0; i < 판수; i++) {
    const { output } = await ai.generateStructuredOutput({ systemInstructions: 지시문, input, schema: 꼴, schemaName: "loop_verdict", maxTokens: 16000, tier: "judgment" });
    const v = output as z.infer<typeof 꼴>;
    맞음수.push(v.met.length); 모름수.push(v.unknown.length); 틀림수.push(v.unmet.length);
    if (i === 0) console.log(`\n${이름} 첫 판 — 맞음 ${v.met.length} · 틀림 ${v.unmet.length} · 모름 ${v.unknown.length}\n  맞음: ${v.met.join(",")}\n  틀림: ${JSON.stringify(v.unmet.map((u) => u.id))}\n  말: ${v.toPerson.slice(0, 110)}`);
  }
  const 평균 = (a: number[]) => (a.reduce((s, n) => s + n, 0) / a.length).toFixed(1);
  console.log(`  ${판수}번 평균 — 맞음 ${평균(맞음수)} (${맞음수.join("/")}) · 틀림 ${평균(틀림수)} (${틀림수.join("/")}) · 모름 ${평균(모름수)} (${모름수.join("/")})`);
}
console.log("\n새 지시문 쪽에서 맞음이 늘거나 모름이 줄어야 지시문이 값을 한 것이다. 같으면 지시문 탓이 아니다.");
