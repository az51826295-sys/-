/** 인스타 게시물 직원의 자 시험 (225회차). 모델 0 · 그림 0. */
const { judgePost, isSocialAsk, pngSize, askFacts } = await import("../../src/lib/skills/socialPost/index");
let bad = 0, seen = 0;
const check = (n: string, ok: boolean, got?: unknown) => { seen++; if (!ok) bad++; console.log(ok ? "맞음  " : "어긋남", n, ok ? "" : JSON.stringify(got)); };
const NL = String.fromCharCode(10);
check("말: '인스타에 올릴 거'", isSocialAsk("인스타에 올릴 거 만들어 줘"));
check("말: '게시물 하나'", isSocialAsk("게시물 하나 만들어 줘"));
check("말: 발표 자료는 아님", !isSocialAsk("발표 자료 8장 만들어 줘"));
// 정사각 PNG 머리 하나 지어서(1024x1024) 자에 먹인다
const png = (w: number, h: number, size = 20000) => { const b = new Uint8Array(size); b[0] = 0x89; b[1] = 0x50; const v = new DataView(b.buffer); v.setUint32(16, w); v.setUint32(20, h); return { bytes: b }; };
check("pngSize 가 1024x1024 를 읽는다", JSON.stringify(pngSize(png(1024, 1024).bytes)) === '{"w":1024,"h":1024}');
const ask = ["로키 인스타 게시물 하나", "쓸 수 있는 사실:", "- 대화창에 말하면 진짜 파일이 나온다", "- 가입은 이메일과 비밀번호만 받는다"].join(NL);
check("주문에서 사실 2개를 읽는다", askFacts(ask).length === 2, askFacts(ask));
const hook = "말하면 파일이 돼요.";
const good = { title: "로키 소개", hook, hookAlts: ["한 줄이면 시작돼요.", "오늘 만든 걸 보여 드릴게요."],
  caption: `${hook}${NL}${NL}대화창에 말하면 진짜 파일이 나와요. 가입은 이메일과 비밀번호만 받아요.`,
  hashtags: ["#로키", "#AI", "#1인창업", "#고등학생창업", "#만들기"], imagePrompt: "a cozy desk at night", variants: 2, why: "담백하게" };
const imgs = [png(1024, 1024), png(1024, 1024)];
const c1 = judgePost(ask, good, imgs);
check("좋은 판: 자 전부 맞음(9개 이상)", c1.length >= 9 && c1.every((k) => k.result === "Passed"), c1.filter((k) => k.result !== "Passed"));
// 고장 심기: 첫 줄 길다 · 해시태그 모양 틀림+겹침 · 지어낸 숫자 · 본문이 첫 줄로 시작 안 함
const longHook = "가".repeat(130);
const bad1 = { ...good, hook: longHook, caption: `다른 말로 시작${NL}${longHook}`, hashtags: ["로키", "#AI", "#ai", "#둘"], };
const f1 = judgePost(ask, bad1, imgs).filter((k) => k.result === "Failed").map((k) => k.name);
check("심은 고장 셋(첫줄 길이·첫줄 위치·해시태그 모양)", ["첫줄_125자이하", "첫줄이_본문_맨앞", "해시태그_모양"].every((n) => f1.includes(n)), f1);
const bad2 = { ...good, caption: `${hook}${NL}벌써 1200명이 쓰고 있어요. 3일 만에 나왔어요.` };
const f2 = judgePost(ask, bad2, imgs).filter((k) => k.result === "Failed").map((k) => k.name);
check("지어낸 숫자를 잡는다", f2.includes("숫자_주문에_있는_것만"), f2);
const f3 = judgePost(ask, good, [png(1024, 1024), png(1024, 1536)]).filter((k) => k.result === "Failed").map((k) => k.name);
check("정사각 아닌 그림을 잡는다", f3.includes("정사각"), f3);
const f4 = judgePost(ask, good, [png(1024, 1024, 500), png(1024, 1024)]).filter((k) => k.result === "Failed").map((k) => k.name);
check("빈 그림을 잡는다", f4.includes("빈_그림_없음"), f4);
const f5 = judgePost(ask, { ...good, caption: hook + NL + "가".repeat(2300) }, imgs).filter((k) => k.result === "Failed").map((k) => k.name);
check("본문 2200자 넘으면 잡는다", f5.includes("본문_2200자이하"), f5);
const f6 = judgePost(ask, { ...good, hashtags: ["#하나", "#둘"] }, imgs).filter((k) => k.result === "Failed").map((k) => k.name);
check("해시태그 2개면 잡는다", f6.includes("해시태그_개수"), f6);
// 심은 고장은 제대로 심어야 한다: 첫 줄("말하면 파일이 돼요")이 이미 사실 1을 되뇌므로, 사실을 하나도 안 쓴 본문으로 심는다.
const noFacts = "오늘 날씨가 좋네요.";
const f7 = judgePost(ask, { ...good, hook: noFacts, caption: noFacts, hashtags: ["#날씨", "#하루", "#기록"] }, imgs).filter((k) => k.result === "Failed").map((k) => k.name);
check("준 사실을 하나도 안 쓰면 잡는다", f7.includes("준_사실_사용"), f7);
// 반쪽(둘 중 하나)은 통과 — 짧은 캡션에서 절반은 봐준다(Deck 과 같은 문턱 0.4/절반).
const half = judgePost(ask, { ...good, caption: `${hook}${NL}오늘은 이것만.` }, imgs).find((k) => k.name === "준_사실_사용");
check("사실 둘 중 하나만 써도 통과(문턱 절반)", half?.result === "Passed", half);
console.log(`${NL}${bad ? `어긋남 ${bad}/${seen}` : `전부 맞음 ${seen}/${seen}`}`);
process.exit(bad ? 1 : 0);
