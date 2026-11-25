/**
 * 아무 캐릭터 하나를 손님 길 그대로(만들기 96 → 4방향) 진짜로 그려 본다.
 *   npx tsx engine/work/realdot/motion/try_one.mts <이름> "<설명>"
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import sharp from "sharp";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
delete process.env.PIXEL_MOTION_MOCK; delete process.env.PIXEL_CREATE_MOCK;
const [name, desc] = process.argv.slice(2);
const D = `C:/Users/az518/Desktop/두근도트-스레드/realdot/try/${name}`; mkdirSync(D, { recursive: true });
const { makeCharacter } = await import("../../../../src/lib/pixel/create");
const { makeMotion, sheetOf, gifOf } = await import("../../../../src/lib/pixel/motion");
const t0 = Date.now();
const c = await makeCharacter(desc, 96);
console.log("만들기", c.ok, "$" + c.usd.toFixed(4), JSON.stringify(c.facts), c.ok ? "" : c.reason);
if (!c.ok) process.exit(0);
writeFileSync(`${D}/1x.png`, c.png); writeFileSync(`${D}/raw.png`, c.raw); writeFileSync(`${D}/big.png`, c.big);
const m = await makeMotion(c.png, "turn");
console.log("4방향", m.ok, m.tries, "$" + m.usd.toFixed(4), JSON.stringify(m.check?.facts), m.ok ? "" : m.reason);
if ("raw" in m && m.raw) writeFileSync(`${D}/turn-raw.png`, m.raw);
console.log(`합계 $${(c.usd + m.usd).toFixed(4)} · ${((Date.now() - t0) / 1000).toFixed(0)}초`);
if (!m.ok) process.exit(0);
const sheet = await sheetOf(m.cuts, m.set); writeFileSync(`${D}/turn-1x.png`, sheet);
const mm = await sharp(sheet).metadata();
writeFileSync(`${D}/turn-big.png`, await sharp(sheet).resize(mm.width! * 5, mm.height! * 5, { kernel: "nearest" }).png().toBuffer());
writeFileSync(`${D}/turn.gif`, await gifOf(m.cuts, m.set, { scale: 5, ms: 500 }));
console.log("ok");
