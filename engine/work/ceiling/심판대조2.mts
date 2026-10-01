/**
 * **지시문 셋 대조 — 틀린 틀림이 줄었나** (228회차 09-30).
 *   npx tsx engine/tools/rookery_env.mts engine/work/ceiling/심판대조2.mts [판수=3]
 *
 * 6판이 실제로 본 사실을 그대로 먹인다. **이 판은 멀쩡하다** — 내가 따로 재서 확인했다
 * (타워를 길 옆에 놓으니 돈 0→350, 목숨 10 그대로). 그러니 `c08-tower-damage`·`c09-enemy-kill-reward` 를
 * **틀림으로 적으면 그건 틀린 판정**이고, **모름으로 두면 맞게 적은 것**이다.
 *
 *  ① 옛 지시문        — 숫자 읽는 법이 없다
 *  ② 센 규칙(09-30 첫 판) — "돈이 줄기만 했으면 unmet" → 이것이 틀린 틀림을 만들었다
 *  ③ 고친 규칙         — "오른 것은 증거, 안 오른 것은 증거가 아니다" → unknown 으로 둬야 맞다
 */
import { readFileSync } from "node:fs";
import { z } from "zod";
import { defaultProviders } from "../../../src/lib/execution/shared";

const 판수 = Number(process.argv[2] ?? 3);
const cj = JSON.parse(readFileSync("engine/work/ceiling/결과6.json", "utf8")) as {
  criteria: { id: string; when: string; then: string }[];
  loop: { facts: { did: string[]; text: string; numberTrail: Record<string, string[]>; movesAfterPlay: number; resumeProbe: string; consoleErrors: string[]; blankAtStart: boolean; changesOnTap: boolean; changesOnKeys: boolean; movesByItself: boolean } };
};
const f = cj.loop.facts;
const 사실줄 = [
  `콘솔 오류 ${f.consoleErrors.length}개`,
  `첫 화면 ${f.blankAtStart ? "비어 있음(단색)" : "그려짐"}`,
  `놀아 본 뒤 그대로 두면 ${f.movesAfterPlay === 2 ? "계속 바뀜(도는 중)" : "안 바뀜"}${f.resumeProbe === "풀려서움직임" ? " — 멈춰 있던 것이고, '재개' 를 누르니 다시 움직였다(고장이 아니다)" : ""}`,
  `해 본 조작: ${f.did.join(" → ")}`,
  `놀아 보는 동안 움직인 숫자: ${Object.entries(f.numberTrail).filter(([, v]) => v.length > 1).map(([k, v]) => `${k} ${v.join("→")}`).join(" · ")}`,
  `끝까지 안 움직인 숫자: ${Object.entries(f.numberTrail).filter(([, v]) => v.length === 1).map(([k, v]) => `${k} ${v[0]}`).join(" · ")}`,
  `놀아 본 뒤 화면 글자: ${f.text}`,
];

const 공통 = [
  "너는 웹 게임(HTML 한 파일)을 **실제로 돌려 본 결과**를 놓고 확인 목록을 대 보는 심판자다.",
  "규칙:",
  "- 본 것만 말한다. 사실로 확인되는 기준만 met. 확인할 수 없는 것은 unknown 이지 met 이 아니다.",
  "- done 은 unmet 과 broken 이 둘 다 비었을 때만 true.",
];
const 오른것규칙 = "- **'놀아 보는 동안 움직인 숫자' 는 증거다.** 돈이 오른 적이 있으면 무언가를 잡아 보상을 받은 것이고(met), 목숨이 줄었으면 적이 끝까지 간 것이다.";
const 지시문들 = {
  "① 옛 지시문": 공통.join("\n"),
  "② 센 규칙(틀린 틀림을 만든 것)": [...공통, 오른것규칙,
    "- **'끝까지 안 움직인 숫자' 도 증거다.** 타워를 놓았는데 돈이 줄기만 하고 한 번도 안 올랐다면 적을 한 마리도 못 죽인 것이다 — 그건 unknown 이 아니라 **unmet** 이다."].join("\n"),
  "③ 고친 규칙": [...공통, 오른것규칙,
    "- **숫자가 안 움직인 것은 unmet 의 근거가 못 된다.** 돈이 줄기만 했어도 타워를 엉뚱한 자리에 놓았거나, 판이 멈춰 있었거나, 기다린 시간이 짧았을 수 있다.",
    "  그럴 때는 **unknown** 으로 두고 nextActions 에 '길에 가까운 빈칸에 타워를 놓고 10초 넘게 기다리기' 를 적어라.",
    "  unmet 은 **안 되는 것을 본 때**만 쓴다 — 오류가 나거나, 눌러도 아무 반응이 없거나, 화면이 약속과 다르게 보일 때."].join("\n"),
};

const 꼴 = z.object({
  met: z.array(z.string()), unmet: z.array(z.object({ id: z.string(), why: z.string() })),
  unknown: z.array(z.string()), broken: z.array(z.string()), done: z.boolean(), toPerson: z.string(),
});
const input =
  `## 주문\n타워 디펜스 (화면 셋·웨이브 10·타워 3종)\n\n## 기기\n데스크톱\n\n` +
  `## 확인 목록\n${cj.criteria.map((c) => `- [${c.id}] ${c.when} → ${c.then}`).join("\n")}\n\n` +
  `## 돌려 본 사실\n${사실줄.map((l) => `- ${l}`).join("\n")}\n`;

/** 이 판은 멀쩡하다 — 이 둘을 틀림으로 적으면 **틀린 틀림**이다. */
const 멀쩡한기준 = ["c08-tower-damage", "c09-enemy-kill-reward"];
const { ai } = defaultProviders(null);
for (const [이름, 지시문] of Object.entries(지시문들)) {
  const 맞음: number[] = [], 모름: number[] = [], 틀림: number[] = [], 틀린틀림: number[] = [];
  for (let i = 0; i < 판수; i++) {
    const { output } = await ai.generateStructuredOutput({ systemInstructions: 지시문, input, schema: 꼴, schemaName: "loop_verdict", maxTokens: 16000, tier: "judgment" });
    const v = output as z.infer<typeof 꼴>;
    맞음.push(v.met.length); 모름.push(v.unknown.length); 틀림.push(v.unmet.length);
    틀린틀림.push(v.unmet.filter((u) => 멀쩡한기준.includes(u.id)).length);
  }
  const 합 = (a: number[]) => (a.reduce((s, n) => s + n, 0) / a.length).toFixed(1);
  console.log(`${이름.padEnd(22)} 맞음 ${합(맞음)} · 틀림 ${합(틀림)} · 모름 ${합(모름)} · **틀린 틀림 ${합(틀린틀림)}** (${틀린틀림.join("/")})`);
}
console.log("\n'틀린 틀림' 은 멀쩡한 기준을 틀렸다고 적은 횟수다. 0 이어야 한다 — 틀린 틀림은 모름보다 비싸다.");
