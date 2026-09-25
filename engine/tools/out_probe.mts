/** 외주 그림 자 시험(216회차). PNG 머리 읽기 · 장 수·빈 그림·화소. 모델 0 · 돈 0. */
const { pngSize, judgeImages } = await import("../../src/lib/skills/outsource/index");
let bad = 0, seen = 0;
const check = (n: string, ok: boolean, got?: unknown) => { seen++; if (!ok) bad++; console.log(ok ? "맞음  " : "어긋남", n, ok ? "" : JSON.stringify(got)); };
// 가짜 PNG: 서명 + IHDR(가로·세로)
function fakePng(w: number, h: number, pad = 20_000): Uint8Array {
  const b = new Uint8Array(pad); b[0] = 0x89; b[1] = 0x50; b[2] = 0x4e; b[3] = 0x47;
  const dv = new DataView(b.buffer); dv.setUint32(16, w); dv.setUint32(20, h); return b;
}
check("PNG 머리에서 1024x1536 을 읽는다", JSON.stringify(pngSize(fakePng(1024, 1536))) === JSON.stringify({ w: 1024, h: 1536 }));
check("PNG 아니면 null", pngSize(new Uint8Array([1, 2, 3])) === null);
const brief = { prompt: "x", size: "1024x1024" as const, variants: 2, textInImage: "", why: "" };
const good = judgeImages(brief, [{ bytes: fakePng(1024, 1024) }, { bytes: fakePng(1024, 1024) }]);
check("좋은 판 3/3", good.every((c) => c.result === "Passed"), good);
const bad1 = judgeImages(brief, [{ bytes: fakePng(1024, 1024) }]);
check("한 장 모자라면 장수 자에 걸림", bad1.some((c) => c.name === "장수_주문대로" && c.result === "Failed"));
const bad2 = judgeImages(brief, [{ bytes: fakePng(1024, 1024, 500) }, { bytes: fakePng(512, 512) }]);
check("빈 그림·화소 틀림을 잡는다", bad2.filter((c) => c.result === "Failed").map((c) => c.name).sort().join(",") === "빈_그림_없음,화소_주문대로", bad2);
// 글 외주 자(216회차)
const { judgeText, wantedCount, askFacts } = await import("../../src/lib/skills/outsource/index");
const NL = String.fromCharCode(10);
const ask = ["인스타 광고 문구 5개 뽑아 줘.", "지어내지 말 것. 쓸 수 있는 사실은 이것뿐이다:", "- 대화창에 말하면 mp4·문서 같은 진짜 파일로 나온다.", "- 이상한 부분만 말하면 그 부분만 다시 만든다.", "- 가입은 이메일과 비밀번호만 받는다. 카드는 안 받는다."].join(NL);
check("개수 읽기 '5개' → 5", wantedCount(ask) === 5);
check("사실 3개 읽기", askFacts(ask).length === 3);
const goodT = { title: "t", items: ["대화창에 말하면 mp4·문서 파일로 나와요", "이상한 부분만 말하면 그 부분만 다시 만들어요", "카드 없이, 이메일과 비밀번호만으로 시작", "말로 시키면 파일로 돌려드려요", "문서도 영상도 대화 한 줄로"], why: "" };
const g = judgeText(ask, goodT, 5);
check("좋은 글: 자 전부 통과", g.every((c) => c.result === "Passed"), g.filter((c) => c.result !== "Passed"));
const badT = { title: "t", items: ["벌써 3만 명이 씁니다 지금 시작하세요 정말 빠르고 정말 쉽고 정말 싸고 정말 좋고 정말 정말 정말 대단합니다 완전", "둘"], why: "" };
const bt = judgeText(ask, badT, 5).filter((c) => c.result === "Failed").map((c) => c.name).sort().join(",");
check("나쁜 글: 개수·길이·주문에 없는 숫자·사실 미사용 넷 다 잡음", bt === "개수_주문대로,문구_60자이하,숫자_주문에_있는_것만,준_사실_사용", bt);
console.log(bad ? `어긋남 ${bad}/${seen}` : `전부 맞음 ${seen}/${seen}`); process.exit(bad ? 1 : 0);
