/** 번역 자 시험(217회차). 모델 0. */
const { judgeTranslate, charLimit, isTranslateAsk, askFacts } = await import("../../src/lib/skills/outsource/index");
const { readFileSync } = await import("node:fs");
let bad = 0, seen = 0;
const NL = String.fromCharCode(10);
const check = (n: string, ok: boolean, got?: unknown) => { seen++; if (!ok) bad++; console.log(ok ? "맞음  " : "어긋남", n, ok ? "" : JSON.stringify(got).slice(0, 300)); };
const ask = readFileSync("engine/work/anything/translate-ask.txt", "utf8");
const src = askFacts(ask);
check("번역 주문으로 알아본다", isTranslateAsk(ask));
check("원문 11줄", src.length === 11, src.length);
check("글자 수 제한 24", charLimit(ask) === 24, charLimit(ask));
const good = { title: "t", why: "", items: src.map((s, i) => ({ src: s, out: ["Platformer Game", "Dawn Hills", "Cloud Bridge", "Starlight Peak", "Clear!", "Game Over", "All lives lost.", "All 3 stages cleared!", "Play Again", "Restart from Start", "Touch Controls"][i] })) };
const g = judgeTranslate(ask, good, src, 24);
check("좋은 번역: 자 전부 통과(7개 이상)", g.length >= 7 && g.every((c) => c.result === "Passed"), g.filter((c) => c.result !== "Passed"));
// 고장: 한 줄 빠짐 · 한글 그대로 · 숫자 3→4 · 24자 넘김
const badItems = good.items.slice(0, 10).map((it, i) => i === 1 ? { ...it, out: "새벽의 언덕" } : i === 7 ? { ...it, out: "All 4 stages cleared successfully and well done!" } : it);
const bd = judgeTranslate(ask, { ...good, items: badItems }, src, 24).filter((c) => c.result === "Failed").map((c) => c.name).sort().join(",");
check("고장 넷: 개수·원문 그대로·숫자·글자 수", bd === "개수_같음,글자수_24자이하,숫자_보존,원문_그대로_아님", bd);
// 자리표시자
const ph = judgeTranslate("영어로 번역", { title: "", why: "", items: [{ src: "{0}점 획득", out: "Scored points" }] }, ["{0}점 획득"], 0).filter((c) => c.result === "Failed").map((c) => c.name);
check("자리표시자 빠지면 잡는다", ph.includes("자리표시자_보존"), ph);
// 용어 사전(217회차)
const { glossaryOf, judgeGlossary } = await import("../../src/lib/skills/outsource/index");
const g1 = glossaryOf("이 문구 영어로" + NL + "용어:" + NL + "- 별빛 = Starlight" + NL + "- 로키 = Rookery" + NL + NL + "- 로키 별빛");
check("기본 사전에 로키→Rookery, 주문 용어 줄도 읽음", g1["로키"] === "Rookery" && g1["별빛"] === "Starlight", g1);
const gj = judgeGlossary([{ src: "로키는 말하면 파일로", out: "Tell Loki and get files" }], glossaryOf(""));
check("로키→Loki 를 잡는다", gj?.result === "Failed", gj);
check("Rookery 면 통과", judgeGlossary([{ src: "로키는", out: "Rookery is" }], glossaryOf(""))?.result === "Passed");
console.log(bad ? `어긋남 ${bad}/${seen}` : `전부 맞음 ${seen}/${seen}`); process.exit(bad ? 1 : 0);
