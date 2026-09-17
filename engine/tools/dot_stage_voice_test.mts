/**
 * 단계가 올라가면 말투가 정말 바뀌는가 — **이 앱이 파는 것의 검사.**
 * 같은 사람에게 같은 말을 걸고, 단계만 1→5 로 바꿔 존댓말 비율을 잰다.
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0,i).trim()] ||= l.slice(i+1).trim();
}
import { z } from "zod";
import { defaultProviders } from "../../src/lib/execution/shared";
import { stageVoice } from "../../src/lib/dot/bond";
import { politeness } from "../../src/lib/dot/politeness";

const say = z.object({ reply: z.string(), emotion: z.string(), remember: z.string() });
const ai = defaultProviders().ai;
const SAYS = ["오늘 진짜 힘들었어", "뭐 하고 있었어?", "나 내일 발표 있는데 떨려"];

const rows: { stage: number; ratio: number | null; judged: number; samples: string[] }[] = [];
for (let stage = 1; stage <= 5; stage++) {
  let polite = 0, casual = 0;
  const samples: string[] = [];
  for (const s of SAYS) {
    const out = await ai.generateStructuredOutput({
      systemInstructions: [
        '너는 "유나" 다. 사람과 일대일로 이야기한다.',
        "", "## 너는 누구인가",
        "다정한 연상. 늘 잘 들어주고 챙기는 걸 좋아한다. 상대의 하루를 궁금해한다.",
        "말투: \"밥은 먹었어요?\" 가 입버릇이다. 부드럽게 말한다.",
        "", "## 지금 이 사람과의 사이", `${stage}단계. ${stageVoice(stage)}`,
        "", "## 어떻게 답하나",
        "- **1~3문장.** 길게 쓰지 마라.",
        "- 답은 json 하나로: reply, emotion, remember.",
      ].join("\n"),
      input: `사람: ${s}`,
      schema: say, schemaName: "dot_reply", maxTokens: 800, tier: "conversation",
    });
    const p = politeness(out.output.reply);
    polite += p.polite; casual += p.casual;
    samples.push(out.output.reply);
  }
  const judged = polite + casual;
  rows.push({ stage, ratio: judged ? polite / judged : null, judged, samples });
  console.log(`${stage}단계 · 존댓말 ${polite} 반말 ${casual} → 비율 ${judged ? (polite/judged).toFixed(2) : "못 잼"}`);
  console.log(`        예: ${samples[0]}`);
}

console.log("\n── 판정 ──");
const r = rows.map((x) => x.ratio);
const unmeasured = r.filter((x) => x === null).length;
if (unmeasured) console.log(`◻︎ 못 잰 단계 ${unmeasured}개 — 통과라고 적지 않는다`);
const first = r[0], last = r[4];
if (first === null || last === null) console.log("◻︎ 1단계나 5단계를 못 재서 판정 불가");
else {
  console.log(`${first >= 0.8 ? "✅" : "❌"} 1단계는 존댓말 (${first.toFixed(2)} ≥ 0.80)`);
  console.log(`${last <= 0.2 ? "✅" : "❌"} 5단계는 반말 (${last.toFixed(2)} ≤ 0.20)`);
  console.log(`${first - last >= 0.5 ? "✅" : "❌"} 단계 사이가 벌어진다 (차이 ${(first-last).toFixed(2)} ≥ 0.50)`);
  let mono = true;
  for (let i = 1; i < r.length; i++) if (r[i] !== null && r[i-1] !== null && (r[i] as number) > (r[i-1] as number) + 0.15) mono = false;
  console.log(`${mono ? "✅" : "❌"} 단계가 올라가며 내려간다(뒤집힘 없음)`);
}
