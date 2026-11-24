/**
 * 생성자 첫 실제 판 (11-25, 사장님 OK) — 태오 · idle · 최대 2번 그림. 결과 파일을 남겨 다시 돌리지 않는다.
 *   npx tsx engine/work/realdot/motion/first_real.mts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
delete process.env.PIXEL_MOTION_MOCK;
const OUT = "C:/Users/az518/Desktop/두근도트-스레드/realdot/first-motion"; mkdirSync(OUT, { recursive: true });
const { makeMotion, gifOf, sheetOf } = await import("../../../../src/lib/pixel/motion");
const t0 = Date.now();
const r = await makeMotion(readFileSync("C:/Users/az518/Desktop/두근도트-시트/taeo-neutral.png"), "idle");
const sec = ((Date.now() - t0) / 1000).toFixed(0);
if ("raw" in r && r.raw) writeFileSync(`${OUT}/raw.png`, r.raw);
if (r.ok) {
  const scale = Math.max(1, Math.min(8, Math.floor(512 / Math.max(r.set.cellW, r.set.cellH))));
  writeFileSync(`${OUT}/idle.gif`, await gifOf(r.cuts, r.set, { scale, ms: 250 }));
  writeFileSync(`${OUT}/idle-sheet-1x.png`, await sheetOf(r.cuts, r.set));
}
const out = { ok: r.ok, tries: r.tries, usd: r.usd, sec, ...(r.ok ? { frames: r.set.frames.length, cell: [r.set.cellW, r.set.cellH], check: r.check } : { reason: r.reason, check: r.check }) };
writeFileSync(`${OUT}/result.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
