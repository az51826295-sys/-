// 11-27 걷기 한 판 시험(약 25~80원): makeWalk 로 그려 rival/<이름>/walk-<tag>* 에 남긴다(팩 파일은 안 건드림)
//   npx tsx walk_try.mts mage covered
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
process.chdir("C:/Users/az518/Desktop/ai-workforce");
for (const l of readFileSync(".env.local", "utf8").split(/\r?\n/)) { const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim(); }
process.env.PIXEL_MOTION_MOCK = "";
const D = "C:/Users/az518/Desktop/두근도트-스레드";
const { makeWalk } = await import("../../../../src/lib/pixel/walk");
const { sheetOf, gifOf } = await import("../../../../src/lib/pixel/motion");
const n = process.argv[2] ?? "mage", tag = process.argv[3] ?? "try";
const src = n.includes("/") ? n : `${D}/itch-pack4/${n}/front.png`;
const name = n.includes("/") ? "custom" : n;
const t0 = Date.now();
const w = await makeWalk(readFileSync(src));
const out = `${D}/rival/${name}`; mkdirSync(out, { recursive: true });
const set = { frames: [], cellW: w.cellW, cellH: w.cellH, bg: null, how: "grid" } as never;
writeFileSync(`${out}/walk-${tag}-1x.png`, await sheetOf(w.frames, set));
writeFileSync(`${out}/walk-${tag}.gif`, await gifOf(w.frames, set, { scale: 6, ms: 180 }));
console.log(`${name} 걷기 ${w.how} ${w.frames.length}장 판${w.tries} $${w.usd.toFixed(4)} ${((Date.now() - t0) / 1000).toFixed(0)}초\n${w.facts.join("\n")}`);
