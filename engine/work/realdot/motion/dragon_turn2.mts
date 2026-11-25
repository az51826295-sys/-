/**
 * 용 4방향 실제 판 (11-25 둘째 판 — medium·예측자·조각 지우기, 사장님 "그려봐") — first-create/dragon-1x.png · turn · 그림 1번(maxTries 1).
 *   npx tsx engine/work/realdot/motion/dragon_turn.mts
 */
import { readFileSync, writeFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
delete process.env.PIXEL_MOTION_MOCK;
const OUT = "C:/Users/az518/Desktop/두근도트-스레드/realdot/first-create";
const { makeMotion, gifOf, sheetOf } = await import("../../../../src/lib/pixel/motion");
const t0 = Date.now();
const r = await makeMotion(readFileSync(`${OUT}/dragon-1x.png`), "turn", { maxTries: 1 });
const sec = ((Date.now() - t0) / 1000).toFixed(0);
if ("raw" in r && r.raw) writeFileSync(`${OUT}/turn2-raw.png`, r.raw);
if (r.ok) {
  const scale = Math.max(1, Math.min(8, Math.floor(512 / Math.max(r.set.cellW, r.set.cellH))));
  writeFileSync(`${OUT}/turn2.gif`, await gifOf(r.cuts, r.set, { scale, ms: 500 }));
  writeFileSync(`${OUT}/turn2-sheet-1x.png`, await sheetOf(r.cuts, r.set));
  const big = (await import("sharp")).default;
  const s1 = await sheetOf(r.cuts, r.set); const m = await big(s1).metadata();
  writeFileSync(`${OUT}/turn2-sheet-big.png`, await big(s1).resize(m.width! * scale, m.height! * scale, { kernel: "nearest" }).png().toBuffer());
}
const out = { ok: r.ok, tries: r.tries, usd: r.usd, sec, ...(r.ok ? { frames: r.set.frames.length, cell: [r.set.cellW, r.set.cellH], check: r.check } : { reason: r.reason, check: r.check }) };
writeFileSync(`${OUT}/turn2-result.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
