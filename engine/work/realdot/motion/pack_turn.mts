// 정면으로 다시 그린 기본 그림(itch-pack3)의 4방향 → itch-pack4/<이름>/turn-1x.png · turn.gif (11-26). 한 종 약 25~50원.
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) { const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim(); }
process.env.PIXEL_MOTION_MOCK = "";
const D = "C:/Users/az518/Desktop/두근도트-스레드";
const { makeMotion, sheetOf, gifOf } = await import("../../../../src/lib/pixel/motion");
let total = 0;
for (const n of process.argv.slice(2)) {
  const t0 = Date.now();
  const m = await makeMotion(readFileSync(`${D}/itch-pack3/${n}/front.png`), "turn"); total += m.usd;
  mkdirSync(`${D}/itch-pack4/${n}`, { recursive: true });
  let line = `${n} 4방향 ${m.ok ? "ok" : "실패"} 판${m.tries} $${m.usd.toFixed(4)} ${((Date.now() - t0) / 1000).toFixed(0)}초`;
  if (m.ok) {
    writeFileSync(`${D}/itch-pack4/${n}/turn-1x.png`, await sheetOf(m.cuts, m.set));
    writeFileSync(`${D}/itch-pack4/${n}/turn.gif`, await gifOf(m.cuts, m.set, { scale: Math.max(1, Math.min(8, Math.floor(512 / Math.max(m.set.cellW, m.set.cellH)))), ms: 500 }));
    line += " · " + m.check.facts.slice(-3).join(" | ");
  } else line += " · " + m.reason.slice(0, 160);
  console.log(line); appendFileSync(`${D}/itch-pack4/log.txt`, line + "\n");
}
console.log(`4방향 합계 $${total.toFixed(4)}`); appendFileSync(`${D}/itch-pack4/log.txt`, `4방향 합계 $${total.toFixed(4)}\n`);
