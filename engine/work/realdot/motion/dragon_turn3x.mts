/**
 * 새 길(medium · 예측자 · 판단자 자르기) 처음부터 3판 (11-25, 사장님 "해 하자") — 판마다 그림 1번(maxTries 1), 통과 수를 센다.
 *   npx tsx engine/work/realdot/motion/dragon_turn3x.mts
 */
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
delete process.env.PIXEL_MOTION_MOCK;
const D = "C:/Users/az518/Desktop/두근도트-스레드/realdot/first-create";
const { makeMotion, sheetOf, gifOf } = await import("../../../../src/lib/pixel/motion");
const ref = readFileSync(`${D}/dragon-1x.png`);
const out: unknown[] = []; let pass = 0, usd = 0;
for (const k of ["a", "b", "c"]) {
  const t0 = Date.now();
  const r = await makeMotion(ref, "turn", { maxTries: 1 });
  usd += r.usd;
  if ("raw" in r && r.raw) writeFileSync(`${D}/turn3${k}-raw.png`, r.raw);
  if (r.ok) {
    pass++;
    const s = await sheetOf(r.cuts, r.set); const m = await sharp(s).metadata();
    writeFileSync(`${D}/turn3${k}-sheet-1x.png`, s);
    writeFileSync(`${D}/turn3${k}-sheet-big.png`, await sharp(s).resize(m.width! * 6, m.height! * 6, { kernel: "nearest" }).png().toBuffer());
    writeFileSync(`${D}/turn3${k}.gif`, await gifOf(r.cuts, r.set, { scale: 8, ms: 500 }));
  }
  const row = { k, ok: r.ok, usd: r.usd, sec: ((Date.now() - t0) / 1000).toFixed(0), ...(r.ok ? { cell: [r.set.cellW, r.set.cellH] } : { reason: r.reason }), facts: r.check?.facts, judge: r.check?.judge?.why };
  out.push(row); console.log(JSON.stringify(row));
}
console.log(`\n통과 ${pass}/3 · 합계 $${usd.toFixed(4)}`);
writeFileSync(`${D}/turn3x-result.json`, JSON.stringify(out, null, 2));
