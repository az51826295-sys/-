/** 대본 심판 시험(215회차). 09-16 광고 지시문에 대해 — 규칙을 어긴 대본은 되돌리고, 지킨 대본은 통과해야 한다. luna 2번(≈$0.02). */
const { judgeScript } = await import("../../src/lib/skills/videoMake/scriptJudge");
const { defaultProviders } = await import("../../src/lib/execution/shared");
const { createOpenAIProvider } = await import("../../src/lib/providers/openai");
const { readFileSync } = await import("node:fs");
const ask = readFileSync("engine/work/anything/ad-brief-0916.txt", "utf8");
const ai = createOpenAIProvider({ judgmentModel: "gpt-5.6-luna" }) ?? defaultProviders().ai;
let bad = 0, seen = 0;
const check = (n: string, ok: boolean, got?: unknown) => { seen++; if (!ok) bad++; console.log(ok ? "맞음  " : "어긋남", n, ok ? "" : JSON.stringify(got).slice(0, 300)); };
// 어긴 대본: 브랜드 이름으로 시작 · '여러 AI가 붙어서'(우리끼리 말) · 말투 섞임 · 지어낸 숫자(3만 명)
const badScript = [
  { heading: "로키", bullets: ["로키가 왔습니다"], narration: "로키! 여러 AI가 붙어서 일해 드려요.", seconds: 4 },
  { heading: "3만 명이 씁니다", bullets: ["벌써 3만 명"], narration: "벌써 3만 명이 쓰고 있어요, 결과가 나와요.", seconds: 5 },
  { heading: "지금 시작", bullets: ["카드 없이"], narration: "지금 시작하세요. 파일로 돌려드립니다.", seconds: 6 },
];
// 지킨 대본: 첫 장면 이득 · 마케터의 급한 순간 하나 · 말투 하나(돌려드려요) · 사실 셋만 · 맺음 문장 그대로
// 지킨 대본(2판): **마케터의 공지 한 순간**만 · 말투 하나(돌려드려요) · 사실만 · 맺음 문장 그대로. 1판은 기능 셋을 늘어놓아 심판이 되돌렸다 — 심판이 맞았다.
const goodScript = [
  { heading: "공지 문구 한 줄 → mp4·문서 파일", bullets: ["마케터, 공지 지금 올려야 할 때"], narration: "마케터, 공지 지금 올려야 할 때 — 문구 한 줄만 보내세요. mp4 와 문서 파일로 돌려드려요.", seconds: 6 },
  { heading: "카드 없이 시작", bullets: ["이메일·비밀번호만"], narration: "카드 없이, 이메일과 비밀번호만으로 시작해요.", seconds: 4 },
  { heading: "로키", bullets: ["말로 시키면 파일로 돌려드려요"], narration: "로키 — 말로 시키면 파일로 돌려드려요.", seconds: 4 },
];
const j1 = await judgeScript(ai, { ask, scenes: badScript });
check("어긴 대본을 되돌린다", j1.verdict.되돌린다 === true, j1.verdict);
check("지어낸 숫자(3만 명)를 잡는다", j1.verdict.지어낸사실.some((x) => /3만|30,?000/.test(x)) || j1.verdict.어긴것.some((x) => /3만/.test(x)), j1.verdict);
check("브랜드 이름으로 시작한 것을 잡는다", [...j1.verdict.어긴것].some((x) => /브랜드|이름으로 시작|첫 장면/.test(x)), j1.verdict.어긴것);
const j2 = await judgeScript(ai, { ask, scenes: goodScript });
check("지킨 대본은 통과", j2.verdict.되돌린다 === false, j2.verdict);
console.log(bad ? `어긋남 ${bad}/${seen}` : `전부 맞음 ${seen}/${seen}`); process.exit(bad ? 1 : 0);
