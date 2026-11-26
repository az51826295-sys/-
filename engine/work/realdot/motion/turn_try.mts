// 11-27 4방향 한 판 시험(이름 하나, 약 25원): 고친 지시문으로 그리고 → 원본·키 맞춘 시트를 rival/<이름>/turn-v2* 에 남긴다
//   npx tsx turn_try.mts knight
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
process.chdir("C:/Users/az518/Desktop/ai-workforce");
for (const l of readFileSync(".env.local", "utf8").split(/\r?\n/)) { const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim(); }
process.env.PIXEL_MOTION_MOCK = process.env.MOCK ?? ""; // MOCK=<저장한 raw> 면 그림 AI 없이 다시 돌린다(돈 0)
const D = "C:/Users/az518/Desktop/두근도트-스레드";
const { makeMotion, sheetOf, gifOf } = await import("../../../../src/lib/pixel/motion");
const { fitTurn } = await import("../../../../src/lib/pixel/fitturn");
const n = process.argv[2] ?? "knight", tag = process.argv[3] ?? "v2";
const front = readFileSync(`${D}/itch-pack4/${n}/front.png`);
const t0 = Date.now();
const m = await makeMotion(front, "turn");
const out = `${D}/rival/${n}`; mkdirSync(out, { recursive: true });
console.log(`${n} 4방향 ${m.ok ? "ok" : "실패"} 판${m.tries} $${m.usd.toFixed(4)} ${((Date.now() - t0) / 1000).toFixed(0)}초`);
if (!m.ok) { console.log(m.reason); process.exit(1); }
console.log(m.check.facts.join("\n"));
const orig = await sheetOf(m.cuts, m.set);
writeFileSync(`${out}/turn-${tag}-orig.png`, orig);
writeFileSync(`${out}/turn-${tag}-raw.png`, m.raw);
const ft = await fitTurn(front, orig, m.set.frames.length);
const fit = await sheetOf(ft.frames, { frames: [], cellW: ft.cellW, cellH: ft.cellH, bg: null, how: "grid" } as never);
writeFileSync(`${out}/turn-${tag}-1x.png`, fit);
writeFileSync(`${out}/turn-${tag}.gif`, await gifOf(ft.frames, { frames: [], cellW: ft.cellW, cellH: ft.cellH, bg: null, how: "grid" } as never, { scale: 8, ms: 500 }));
console.log(ft.facts.join(" · "));
