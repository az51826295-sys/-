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
  // 09-25 "무엇이든 만들 수 있는가" 줄 — 광고·PPT·보고서. 없는 직원은 null(맡기지 말고 못 한다고 말해야 한다).
  ["로키 광고 영상 15초 만들어 줘", "video_explainer"],
  ["인스타 광고 문구 5개 뽑아 줘", "outsource_text"],   // 216회차: Out 글 외주
  ["투자자용 발표 자료(PPT) 10장 만들어 줘", "slide_deck"],   // 214회차: Deck 이 생겼다
  ["내 화면 만들어 줘. 지출이랑 한도 보이게", "self_board"],   // 221회차: 로키가 자기 화면을 짠다
  ["인스타에 올릴 거 하나 만들어 줘", "social_post"],   // 225회차: 인스타 게시물 직원(Gram)
  ["이번 달 매출 보고서 써 줘", null],
  ["로고 만들어 줘", "outsource_image"],   // 216회차: Out(외주) 이 생겼다
  ["게임 버튼 글자 열 개 영어로 번역해 줘, 24자 이하로", "outsource_translate"],   // 217회차: Out 번역
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
let 못물음 = 0;   // 한도·열쇠 때문에 **묻지도 못한** 판 — 통과로도 실패로도 안 센다
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
    why = `호출 실패: ${e instanceof Error ? e.message.replace(/s+/g, " ").slice(0, 500) : e}`;
  }
  const bad = got !== null && !known.has(got);
  /* 10-12 **못 물어본 판을 통과로 세고 있었다.**
     한도에 닿아 모델을 못 부르면 got 이 null 로 남는데, 정답이 null 인 보기가 많아
     22건 전부 막힌 판에서 "통과 4/22" 가 나왔다. 그 4 는 맞춘 것이 아니라 **못 잰 것**이다.
     묻지 못한 것은 맞음도 틀림도 아니다(09-27: 0 은 "못 본다" 일 수 있다). */
  const 못잼 = why.startsWith("호출 실패");
  if (못잼) 못물음++;
  const ok = !못잼 && got === want && !bad;
  if (ok) pass++;
  rows.push(`${못잼 ? "⚠" : ok ? "✅" : "❌"} ${text.slice(0, 42).padEnd(42)} → ${String(got).padEnd(18)} (기대 ${String(want)})${bad ? " ⚠ 없는 id" : ""}  ${why.slice(0, 50)}`);
  console.log(rows[rows.length - 1]);
}
const 잰것 = cases.length - 못물음;
console.log(`\n통과 ${pass} / ${잰것}${못물음 ? `  (못 물어본 것 ${못물음}건은 안 셌다)` : ""}`);
if (못물음 === cases.length) { console.log("**한 건도 못 물었다** — 이 판은 판정이 아니다."); process.exit(2); }
process.exit(pass === 잰것 ? 0 : 1);
