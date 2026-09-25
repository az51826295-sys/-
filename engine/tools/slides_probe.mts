/** 발표 자료 직원의 자 시험(214회차). 모델 0 · 헤드리스 1번. */
const { wantedSlides, renderDeck, judgeDeck } = await import("../../src/lib/skills/slidesMake/index");
const { runWeb } = await import("../../src/lib/skills/appBuild/run");
let bad = 0, seen = 0;
const check = (n: string, ok: boolean, got?: unknown) => { seen++; if (!ok) bad++; console.log(ok ? "맞음  " : "어긋남", n, ok ? "" : JSON.stringify(got)); };
check("장 수 읽기: '발표 자료 10장'", wantedSlides("투자자용 발표 자료 10장 만들어 줘") === 10);
check("장 수 읽기: 없으면 8", wantedSlides("로키 소개 자료") === 8);
check("장 수 읽기: 99장은 30으로", wantedSlides("99장") === 30);
const good = { title: "로키 소개", subtitle: "말하면 파일이 돼요", audience: "처음 듣는 사람", slides: [
  { heading: "로키 소개", bullets: [], note: "" }, { heading: "무엇이 나오나", bullets: ["게임", "영상", "분석", "발표 자료"], note: "넷" },
  { heading: "어떻게 시키나", bullets: ["대화창에 한 줄"], note: "" }, { heading: "맺음", bullets: ["지금 한 줄 적어 보세요"], note: "" } ] };
const html = renderDeck(good);
check("HTML 에 장 4개", (html.match(/class="slide/g) ?? []).length === 4);
check("HTML 에 바깥 자원 없음", !/https?:/.test(html));
const f = await runWeb([{ path: "deck.html", language: "html", contents: html }], { mobile: false, actions: [{ do: "wait", ms: 500 }] });
const facts = { ran: f.ran, consoleErrors: f.consoleErrors, text: f.text };
const c1 = judgeDeck(good, 4, facts);
check("좋은 판: 자 전부 통과(6개 이상)", c1.length >= 6 && c1.every((k) => k.result === "Passed"), c1.filter((k) => k.result !== "Passed"));
// 고장 심기: 글머리 6개 · 47자 글머리 · 첫 장에 글머리 셋 · 장 수 목표 12
const bad1 = { ...good, slides: [{ heading: "제목", bullets: ["a", "b", "c"], note: "" }, { heading: "많이", bullets: ["1", "2", "3", "4", "5", "6"], note: "" }, { heading: "길게", bullets: ["대화창에 한 줄만 적으면 로키가 알아서 게임도 영상도 분석도 다 만들어 줍니다 정말로"], note: "" }] };
const c2 = judgeDeck(bad1, 12, facts);
const failedNames = c2.filter((k) => k.result === "Failed").map((k) => k.name);
check("심은 고장 넷을 다 잡는다(장수·글머리수·글자수·첫장)", ["장수_목표안", "글머리_4개이하", "글머리_40자이하", "첫장_제목만"].every((n) => failedNames.includes(n)), failedNames);
check("헤드리스 못 열면 통과 아님", judgeDeck(good, 4, null).some((k) => k.name === "브라우저_오류0" && k.result === "Failed"));
// 214회차 첫 실전 판 재현: 준 사실 셋을 안 쓰고 전부 '확인 필요'
const { givenFacts } = await import("../../src/lib/skills/slidesMake/index");
const ask = ["로키 소개 발표 자료 8장", "지어내지 말 것. 쓸 수 있는 사실은 이것뿐이다:", "- 대화창에 말하면 mp4·문서 같은 진짜 파일로 나온다.", "- 이상한 부분만 말하면 그 부분만 다시 만든다.", "- 가입은 이메일과 비밀번호만 받는다. 카드는 안 받는다."].join(String.fromCharCode(10));
check("주문에서 사실 3개를 읽는다", givenFacts(ask).length === 3, givenFacts(ask));
const loki = { ...good, slides: [{ heading: "로키 소개", bullets: [], note: "" }, { heading: "로키란?", bullets: ["정의: 확인 필요", "이름의 유래: 확인 필요"], note: "" }, { heading: "기원", bullets: ["등장 배경: 확인 필요", "시대: 확인 필요"], note: "" }] };
const c3 = judgeDeck(loki, 3, facts, ask).filter((k) => k.result === "Failed").map((k) => k.name);
check("신화 로키 판: 준_사실_사용·확인필요 둘 다 잡는다", c3.includes("준_사실_사용") && c3.includes("확인필요_30%이하"), c3);
const usesFacts = { ...good, slides: [{ heading: "로키 소개", bullets: [], note: "" }, { heading: "말하면 파일이 돼요", bullets: ["대화창에 말하면 mp4·문서 같은 진짜 파일로 나온다"], note: "" }, { heading: "고치기", bullets: ["이상한 부분만 말하면 그 부분만 다시 만든다"], note: "" }, { heading: "가입", bullets: ["이메일과 비밀번호만, 카드는 안 받는다"], note: "" }] };
const c4 = judgeDeck(usesFacts, 4, facts, ask);
check("사실을 쓴 판: 전부 통과", c4.every((k) => k.result === "Passed"), c4.filter((k) => k.result !== "Passed"));
// 재료에 맞춰 장 수 깎기(218회차)
const { fitWant } = await import("../../src/lib/skills/slidesMake/index");
const ask3 = ["로키 소개 발표 자료 8장", "쓸 수 있는 사실:", "- 대화창에 말하면 파일로 나온다", "- 이상한 부분만 다시 만든다", "- 카드는 안 받는다"].join(String.fromCharCode(10));
check("사실 3개에 8장 주문 → 5장", fitWant(ask3, 8).want === 5 && fitWant(ask3, 8).note.length > 0, fitWant(ask3, 8));
check("사실 3개에 5장 주문 → 그대로", fitWant(ask3, 5).want === 5 && fitWant(ask3, 5).note === "");
check("사실이 없으면 그대로", fitWant("발표 자료 10장", 10).want === 10);
console.log(bad ? `어긋남 ${bad}/${seen}` : `전부 맞음 ${seen}/${seen}`); process.exit(bad ? 1 : 0);
