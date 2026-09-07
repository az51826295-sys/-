/**
 * 접수 자 — 사장님이 이렇게 말하면 **누가 불려 오는가** (40회차 09-07).
 *
 * 09-05 에 Nova·Dev 는 등록 한 줄이 빠져 일주일 동안 일을 못 받았고, 아무 화면에도 그 사실이 안 보였다.
 * 직원을 더할 때마다 같은 위험이 생기므로 여기서 말 → 직원을 실제 모델로 재고, 틀리면 표로 보여 준다.
 * 화면과 **같은 프롬프트**(`src/lib/chat/routing.ts`)를 쓴다 — 시험용으로 따로 쓴 글은 시험이 아니다.
 *
 *   npx tsx engine/tools/routing_test.mts            (전부)
 *   npx tsx engine/tools/routing_test.mts 분석        (이름에 '분석' 든 줄만)
 */
import { z } from "zod";
import { readFileSync } from "node:fs";
import { intakeInstructions, capabilityCatalogue } from "../../src/lib/chat/routing";
import { defaultProviders } from "../../src/lib/execution/shared";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.startsWith("#")) process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim();
}

/** 말 → 와야 하는 이름표. `null` 은 "사람 붙이지 마라"(잡담·바로 답할 질문). */
const CASES: [string, string | null][] = [
  ["Dev, 동전을 20개로 늘리고 길 따라 3~5 m 간격으로 놔 줘.", "small_app"],
  ["유니티로 3인칭 카메라 따라가게 만들어 줘", "small_app"],
  ["이 영상 분석해 줘 https://www.youtube.com/watch?v=09r1B9cVEQY", "analysis_sources"],
  ["이 글 요약해 줘 https://80.lv/articles/level-design-workshop-blockmesh-and-lighting-tips", "analysis_sources"],
  ["이 PDF 에서 숫자만 뽑아 줘 http://www.davidshaver.net/DShaver_Invisible_Intuition_DirectorsCut.pdf", "analysis_sources"],
  ["우리 게임 소개 영상 60초로 만들어 줘", "video_explainer"],
  ["유튜브 쇼츠 하나 만들어 줘, 첫 레벨 규칙 소개하는 걸로", "video_explainer"],
  ["고양이 기사 3D 로 만들어 줘", "mesh_from_image"],
  ["동전 스프라이트 그려 줘", "game_character_art"],
  ["경쟁 게임들 요즘 어떤지 조사해 줘", "market_context"],
  ["아트 바이블 만들어 줘", "visual_direction"],
  ["오늘 몇 시야?", null],
  ["고마워, 잘 돼 간다", null],
  ["유니티에서 Rigidbody 랑 CharacterController 차이가 뭐야?", null],
];

const plan = z.object({ capabilityId: z.string().nullable(), why: z.string() });
const only = process.argv[2];
const cases = only ? CASES.filter(([t]) => t.includes(only)) : CASES;
const known = new Set(capabilityCatalogue().map((c) => c.capabilityId));
console.log(`이름표 ${known.size}개: ${[...known].join(", ")}\n`);

const ai = defaultProviders().ai;
let pass = 0;
const rows: string[] = [];
for (const [text, want] of cases) {
  let got: string | null = null;
  let why = "";
  try {
    const r = await ai.generateStructuredOutput({
      systemInstructions:
        intakeInstructions({ hasImages: false, speaker: null }) +
        "\n\n**지금은 접수만 한다.** `capabilityId` 와 `why`(왜 그 사람인지 한 줄)만 낸다. 맡길 일이 아니면 capabilityId 는 null.",
      input: text,
      schema: plan,
      schemaName: "routing_probe",
      maxTokens: 4000,
      tier: "conversation",
    });
    got = r.output.capabilityId;
    why = r.output.why;
  } catch (e) {
    why = `호출 실패: ${e instanceof Error ? e.message.slice(0, 80) : e}`;
  }
  const bad = got !== null && !known.has(got);
  const ok = got === want && !bad;
  if (ok) pass++;
  rows.push(`${ok ? "✅" : "❌"} ${text.slice(0, 42).padEnd(42)} → ${String(got).padEnd(18)} (기대 ${String(want)})${bad ? " ⚠ 없는 id" : ""}  ${why.slice(0, 50)}`);
  console.log(rows[rows.length - 1]);
}
console.log(`\n통과 ${pass} / ${cases.length}`);
process.exit(pass === cases.length ? 0 : 1);
