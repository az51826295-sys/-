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
console.log(bad ? `어긋남 ${bad}/${seen}` : `전부 맞음 ${seen}/${seen}`); process.exit(bad ? 1 : 0);
