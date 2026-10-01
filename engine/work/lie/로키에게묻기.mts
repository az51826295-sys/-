/**
 * **로키에게 세계관을 묻는다** (228회차 10-01, 사장님 "로키한테 물어봐"). 모델 값이 든다(판단 자리 ×3).
 *   npx tsx engine/tools/rookery_env.mts engine/work/lie/로키에게묻기.mts [판수=3]
 *
 * ## 어디에 묻나
 * `/ask` 대화창은 쿠키로 사람을 가려서 도구에서 못 부른다. 그래서 **그 대화가 쓰는 판단 자리**에 바로 묻는다.
 * 같은 모델·같은 등급이다 — 다만 대화창의 말투 지시문은 안 씌운다(판단만 받는다).
 *
 * ## 세 번 묻는다
 * 한 번 물어서 ② 가 나오면 "로키가 ② 를 골랐다" 고 적고 싶어진다. 그런데 모델은 흔들린다 —
 * 09-27 에 수학 6/6 이 다섯 번씩 재니 3/10 이 됐다. **같은 걸 세 번 묻고 갈라진 것까지 적는다.**
 *
 * ## 로키에게 유리하게 묻지 않는다
 * 제안서에 내가 적은 *"내 생각은 ② 다"* 는 **빼고** 준다. 그걸 같이 주면 로키는 내 답을 읽고 따라 한다 —
 * 그건 물어본 게 아니라 메아리를 들은 것이다.
 */
import { readFileSync } from "node:fs";
import { z } from "zod";

const { defaultProviders } = await import("../../../src/lib/execution/shared");
const 판수 = Number(process.argv[2] ?? 3);

// 제안서에서 **내 생각은 빼고** 넘긴다.
const 제안서 = readFileSync("engine/docs/lie-world-proposal.md", "utf8").split("## 내 생각")[0];

const 꼴 = z.object({
  고른것: z.enum(["①", "②", "③"]),
  한줄: z.string().describe("고른 까닭 한 줄"),
  까닭: z.array(z.string()).describe("2~4줄. 왜 이게 나은가 — 분위기가 아니라 **규칙**으로."),
  걸리는점: z.string().describe("고른 것의 가장 큰 약점 하나. 없다고 하지 마라."),
  첫조각: z.string().describe("고르면 **가장 먼저 만들 것** 하나. 한 줄로."),
});

const 지시문 = [
  "너는 만들던 게임의 세계관을 **고르는 자리**에 있다. 한국어로 답한다.",
  "",
  "고르는 기준은 하나다: **그 세계여야만 생기는 규칙이 있는가.**",
  "분위기만 다르고 규칙이 같으면 그건 껍데기다 — 그런 쪽은 고르지 마라.",
  "",
  "- 만드는 사람은 **학생 한 명**이고 주말에 두세 시간 쓴다. 끝낼 수 있는 크기인지도 본다.",
  "- 지금 돌아가는 것: 수치 넷(압박·당황·분노·경계)을 코드가 세고, 교차 검증과 최종 지목이 붙어 있다.",
  "- **좋은 말만 하지 마라.** 고른 것의 약점을 반드시 하나 댄다.",
].join("\n");

const { ai } = defaultProviders(null);
const 뽑은것: { 고른것: string; 한줄: string; 까닭: string[]; 걸리는점: string; 첫조각: string }[] = [];

for (let i = 1; i <= 판수; i++) {
  const { output } = await ai.generateStructuredOutput({
    systemInstructions: 지시문,
    input: `${제안서}\n\n위 셋 중 하나를 골라라.`,
    schema: 꼴, schemaName: "world_pick", maxTokens: 16000, tier: "judgment",
  });
  const r = output as (typeof 뽑은것)[number];
  뽑은것.push(r);
  console.log(`\n════ ${i}판 — **${r.고른것}**`);
  console.log(`  한 줄: ${r.한줄}`);
  for (const c of r.까닭) console.log(`  · ${c}`);
  console.log(`  걸리는 점: ${r.걸리는점}`);
  console.log(`  첫 조각: ${r.첫조각}`);
}

const 센것: Record<string, number> = {};
for (const r of 뽑은것) 센것[r.고른것] = (센것[r.고른것] ?? 0) + 1;
const 줄선것 = Object.entries(센것).sort((a, b) => b[1] - a[1]);
console.log(`\n────────────────────────────`);
console.log(`**${판수}번 물어서**: ${줄선것.map(([k, n]) => `${k} ${n}번`).join(" · ")}`);
console.log(줄선것.length === 1
  ? `로키는 ${줄선것[0][0]} 로 **흔들리지 않았다.**`
  : `**갈렸다.** 로키도 확신이 없다는 뜻이다 — 고르는 건 사장님 몫이 맞다.`);
