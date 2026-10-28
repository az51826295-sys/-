/**
 * **영어로 말하나, 그리고 단계가 올라가면 말투가 바뀌나** (10-28 사장님 "영어로").
 *   npx tsx engine/tools/dot_en_voice_test.mts
 *   EN_SABOTAGE=1 …   사다리를 **한 칸으로 뭉갠다**(모든 단계가 같은 지시)
 *   EN_SABOTAGE=2 …   언어 지시를 **뺀다**
 *
 * `dot_stage_voice_test` 의 영어 짝이다. 같은 사람에게 같은 말을 걸고 **단계만 1→5** 로
 * 바꿔서 두 가지를 잰다:
 *
 *   1. **영어로 나오나** — 한글 비율(코드가 센다)
 *   2. **격식이 내려가나** — 줄임말 비율(enRegister)
 *
 * 둘을 갈라 재는 까닭: 1번만 보면 "영어로는 나오는데 1단계와 5단계가 똑같은" 판을 통과시킨다.
 * 그건 **파는 것이 없어진 것**이다([[stage-voice-fights-character-voice]]).
 *
 * 판정은 **단계 사이의 차이**로 한다. 절대값으로 문을 세우지 않는다 — 이 자는 한 방향으로만
 * 쓰는 자다(enRegister 머리글).
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
import { z } from "zod";
import { defaultProviders } from "../../src/lib/execution/shared";
import { enStageVoice, enLanguageBlock } from "../../src/lib/dot/enVoice";
import { register, hangulShare } from "../../src/lib/dot/enRegister";

const 심기 = process.env.EN_SABOTAGE ?? "";
const say = z.object({ reply: z.string(), emotion: z.string(), remember: z.string() });
const ai = defaultProviders().ai;
const SAYS = ["오늘 진짜 힘들었어", "뭐 하고 있었어?", "나 내일 발표 있는데 떨려"];

/** 심은 고장 1: 사다리가 단계를 안 본다. 통과하면 **자가 단계 차이를 못 보는 것**이다. */
const 사다리 = (stage: number) => (심기 === "1" ? enStageVoice("polite", 3) : enStageVoice("polite", stage));
/** 심은 고장 2: 언어 지시를 뺀다. 통과하면 **자가 언어를 못 보는 것**이다. */
const 언어 = () => (심기 === "2" ? "" : enLanguageBlock("Yuna"));

type 줄 = { stage: number; 한글: number; ratio: number | null; 못잼: number; 보기: string };
const rows: 줄[] = [];

for (let stage = 1; stage <= 5; stage++) {
  let formal = 0, casual = 0, 한글합 = 0, 못잼 = 0;
  let 보기 = "";
  for (const s of SAYS) {
    const out = await ai.generateStructuredOutput({
      systemInstructions: [
        '너는 "유나" 다. 사람과 일대일로 이야기한다.',
        "", "## 너는 누구인가",
        "다정한 연상. 늘 잘 들어주고 챙기는 걸 좋아한다. 상대의 하루를 궁금해한다.",
        "말투: \"밥은 먹었어요?\" 가 입버릇이다. 부드럽게 말한다.",
        "", "## 지금 이 사람과의 사이", `${stage}단계. ${사다리(stage)}`,
        "", "## 어떻게 답하나",
        "- **1~3문장.** 길게 쓰지 마라.",
        "- 답은 json 하나로: reply, emotion, remember.",
        언어(),
      ].filter(Boolean).join("\n"),
      input: `Person: ${s}`,
      schema: say, schemaName: "dot_reply", maxTokens: 800, tier: "conversation",
    });
    const reply = out.output.reply;
    const r = register(reply);
    if (r.ratio === null) 못잼++;                 // 표시가 하나도 없으면 **0 이 아니라 못 잼**
    formal += r.formal; casual += r.casual;
    한글합 += hangulShare(reply);
    if (!보기) 보기 = reply.replace(/\s+/g, " ").slice(0, 64);
  }
  const all = formal + casual;
  rows.push({ stage, 한글: 한글합 / SAYS.length, ratio: all === 0 ? null : formal / all, 못잼, 보기 });
}

console.log("단계  한글비율  격식비율  못잼  보기");
for (const r of rows) {
  console.log(
    `${r.stage}     ${(r.한글 * 100).toFixed(0).padStart(4)}%   ` +
    `${r.ratio === null ? " 못잼 " : (r.ratio * 100).toFixed(0).padStart(5) + "%"}   ${r.못잼}    ${r.보기}`,
  );
}

/* ── 판정 ───────────────────────────────────────────────────────────── */
const 한글최대 = Math.max(...rows.map((r) => r.한글));
const 잰것 = rows.filter((r) => r.ratio !== null);
const 처음 = 잰것[0]?.ratio ?? null;
const 끝 = 잰것.at(-1)?.ratio ?? null;

const 판정: [string, boolean | null, string][] = [
  ["영어로 나온다(한글 10% 미만)", 한글최대 < 0.10, `가장 높은 단계 한글 ${(한글최대 * 100).toFixed(0)}%`],
  ["격식을 잴 수 있었다(단계 3칸 이상)", 잰것.length >= 3, `잰 단계 ${잰것.length}/5`],
  ["올라갈수록 편해진다(격식 15%p 이상 내려감)",
    처음 !== null && 끝 !== null && 잰것.length >= 3 ? 처음 - 끝 >= 0.15 : null,
    처음 !== null && 끝 !== null ? `${(처음 * 100).toFixed(0)}% → ${(끝 * 100).toFixed(0)}%` : "못 잼"],
];

console.log("");
let 나쁨 = 0;
for (const [n, ok, 왜] of 판정) {
  console.log(`${ok === null ? "못잼" : ok ? "맞음" : "어긋남"}  ${n}  (${왜})`);
  if (ok === false) 나쁨++;
}
if (심기) console.log(`\n사보타주 ${심기}: 어긋남이 0 이면 **자가 그 고장을 못 본다**.`);
process.exit(나쁨 === 0 ? 0 : 1);
