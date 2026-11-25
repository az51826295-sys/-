/**
 * 단위 맞추기 협업 시험 (11-25, 사장님 "해보자") — 마법사 96칸: 만들기(격자 판 + 숫자 되돌리기) → 4방향. 손님 길 그대로.
 * 결과를 [아까 medium | 이번 | 픽셀랩] 세 줄로 나란히(같은 배율, 바닥 맞춤).
 *   npx tsx engine/work/realdot/motion/wizard_unit.mts
 */
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
delete process.env.PIXEL_MOTION_MOCK; delete process.env.PIXEL_CREATE_MOCK;
const D = "C:/Users/az518/Desktop/두근도트-스레드/realdot/compare4/wizard";
const { makeCharacter } = await import("../../../../src/lib/pixel/create");
const { makeMotion, sheetOf } = await import("../../../../src/lib/pixel/motion");
const t0 = Date.now();
const c = await makeCharacter("an old wizard with a blue robe and a staff", 96);
console.log("만들기", c.ok, "$" + c.usd.toFixed(4), JSON.stringify(c.facts), c.ok ? "" : c.reason);
if (!c.ok) process.exit(0);
writeFileSync(`${D}/unit-1x.png`, c.png); writeFileSync(`${D}/unit-raw.png`, c.raw); writeFileSync(`${D}/unit-big.png`, c.big);
const m = await makeMotion(c.png, "turn");
console.log("4방향", m.ok, m.tries, "$" + m.usd.toFixed(4), JSON.stringify(m.check?.facts));
if ("raw" in m && m.raw) writeFileSync(`${D}/unit-turn-raw.png`, m.raw);
console.log(`합계 $${(c.usd + m.usd).toFixed(4)} · ${((Date.now() - t0) / 1000).toFixed(0)}초`);
if (!m.ok) process.exit(0);
const sheet = await sheetOf(m.cuts, m.set); writeFileSync(`${D}/unit-turn-1x.png`, sheet);
const S = 4;
async function split(p: Buffer) { const mm = await sharp(p).metadata(); const cw = Math.floor(mm.width! / 4); return Promise.all([0, 1, 2, 3].map(async (i) => { const b = await sharp(p).extract({ left: i * cw, top: 0, width: cw, height: mm.height! }).png().toBuffer(); try { return await sharp(b).trim().png().toBuffer(); } catch { return b; } })); }
const pl = await Promise.all(["south", "east", "north", "west"].map(async (d) => { const b = readFileSync(`${D}/pl-${d}.png`); try { return await sharp(b).trim().png().toBuffer(); } catch { return b; } }));
const rows = [await split(readFileSync(`${D}/ours-turn-1x.png`)), await split(sheet), pl];
const cellW = 110 * S, cellH = 100 * S;
const comp: sharp.OverlayOptions[] = [];
for (let r = 0; r < 3; r++) for (let i = 0; i < 4; i++) {
  const mm = await sharp(rows[r][i]).metadata();
  const b = await sharp(rows[r][i]).resize(mm.width! * S, mm.height! * S, { kernel: "nearest" }).png().toBuffer();
  comp.push({ input: b, left: i * cellW + Math.floor((cellW - mm.width! * S) / 2), top: r * cellH + (cellH - mm.height! * S) - 8 });
}
await sharp({ create: { width: 4 * cellW, height: 3 * cellH, channels: 4, background: "#ffffff" } }).composite(comp).png().toFile(`${D}/compare-unit.png`);
console.log("ok");
