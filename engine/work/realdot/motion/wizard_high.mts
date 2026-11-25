/**
 * 고품질 시험 (11-25, 사장님 "고품질로 하자 가격을 올리더라도") — 마법사: 첫 그림 high + 4방향 high. 판 1번(다시 그리기는 손님 길대로 1번까지).
 * 결과를 [지금(medium) | 고품질 | 픽셀랩] 세 줄로 나란히.
 *   npx tsx engine/work/realdot/motion/wizard_high.mts
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
const c = await makeCharacter("an old wizard with a blue robe and a staff", 64);
console.log("만들기", c.ok, c.usd, c.facts);
if (!c.ok) process.exit(0);
writeFileSync(`${D}/high-1x.png`, c.png); writeFileSync(`${D}/high-raw.png`, c.raw);
const m = await makeMotion(c.png, "turn");
console.log("4방향", m.ok, m.tries, m.usd, JSON.stringify(m.check?.facts));
if ("raw" in m && m.raw) writeFileSync(`${D}/high-turn-raw.png`, m.raw);
console.log(`합계 $${(c.usd + m.usd).toFixed(4)} · ${((Date.now() - t0) / 1000).toFixed(0)}초`);
if (!m.ok) process.exit(0);
const sheet = await sheetOf(m.cuts, m.set); writeFileSync(`${D}/high-turn-1x.png`, sheet);
// 나란히: 같은 배율(4배), 줄마다 4칸
const S = 4;
async function row(cells: Buffer[]) { return Promise.all(cells.map(async (b) => { const mm = await sharp(b).metadata(); return sharp(b).resize(mm.width! * S, mm.height! * S, { kernel: "nearest" }).png().toBuffer(); })); }
async function split(p: Buffer) { const mm = await sharp(p).metadata(); const cw = Math.floor(mm.width! / 4); return Promise.all([0, 1, 2, 3].map((i) => sharp(p).extract({ left: i * cw, top: 0, width: cw, height: mm.height! }).png().toBuffer())); }
const rows = [await row(await split(readFileSync(`${D}/ours-turn-1x.png`))), await row(await split(sheet)), await row(await Promise.all(["south", "east", "north", "west"].map((d) => sharp(readFileSync(`${D}/pl-${d}.png`)).png().toBuffer())))];
const cellW = 100 * S, cellH = 100 * S;
const comp: sharp.OverlayOptions[] = [];
for (let r = 0; r < 3; r++) for (let i = 0; i < 4; i++) { const mm = await sharp(rows[r][i]).metadata(); comp.push({ input: rows[r][i], left: i * cellW + Math.floor((cellW - mm.width!) / 2), top: r * cellH + (cellH - mm.height!) }); }
await sharp({ create: { width: 4 * cellW, height: 3 * cellH, channels: 4, background: "#ffffff" } }).composite(comp).png().toFile(`${D}/compare-high.png`);
console.log("ok");
