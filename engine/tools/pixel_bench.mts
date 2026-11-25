/**
 * 도트 작업실 **실패율 자** (11-25, 사장님 "실패 안되게 계속 업글 · 그전엔 상품이 아니야").
 * 손님 길 그대로: 만들기(캔버스 섞어서) → 4방향 → 걷기. 다시 그리기는 손님 길과 같게(만들기 단위 협업 1번 · 동작 2판까지).
 *   npx tsx engine/tools/pixel_bench.mts [회차이름]      (돈 듦: 한 바퀴 약 $0.6~0.8)
 * 기록(먼저 적음): 캐릭터마다 기계 실패(결과 없음) · 하늘색 점(투명과 맞닿은 배경색 칸) · 판단자 말 · 값.
 * 사람 눈 확인용으로 모든 결과를 한 장(bench-all.png)에 모은다 — 판단자가 놓친 것은 사람이 센다.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import sharp from "sharp";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
delete process.env.PIXEL_MOTION_MOCK; delete process.env.PIXEL_CREATE_MOCK;
const RUN = process.argv[2] ?? "r1";
const OUT = `C:/Users/az518/Desktop/두근도트-스레드/realdot/bench/${RUN}`; mkdirSync(OUT, { recursive: true });
const SET: [string, string, 32 | 48 | 64 | 96][] = [
  ["bunny", "a cute pink bunny girl holding a carrot", 48],
  ["dwarf", "a heavy armored dwarf warrior with a big axe", 64],
  ["skeleton", "a skeleton archer with a bow", 64],
  ["slime", "a small blue slime with big eyes", 32],
  ["ninja", "a ninja in black clothes with two swords on the back", 64],
  ["catchef", "a fat orange cat chef with a white chef hat", 48],
  ["elf", "a female elf mage with long green hair and a wooden staff", 96],
  ["robot", "a boxy robot with glowing red eyes", 64],
  ["farmer", "a farmer boy with a straw hat and a pitchfork", 48],
  ["demon", "a giant red demon with horns and bat wings", 96],
];
const { makeCharacter } = await import("../../src/lib/pixel/create");
const { makeMotion, sheetOf, headFlicker } = await import("../../src/lib/pixel/motion");
const { PIXEL_BG } = await import("../../src/lib/pixel/frames");
async function specks(png: Buffer) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const near = (i: number) => Math.abs(data[i] - PIXEL_BG[0]) + Math.abs(data[i + 1] - PIXEL_BG[1]) + Math.abs(data[i + 2] - PIXEL_BG[2]) < 48;
  let n = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const i = (y * info.width + x) * 4; if (!data[i + 3] || !near(i)) continue;
    if ([[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].some(([a, b]) => a < 0 || b < 0 || a >= info.width || b >= info.height || !data[(b * info.width + a) * 4 + 3])) n++;
  }
  return n;
}
// 11-25 1바퀴에서 사람 눈이 잡은 것(걷기 미끄러짐)을 자로: 윗몸 가운데 x 의 프레임 간 흔들림(칸)
async function drift(png: Buffer) {
  const m = await sharp(png).metadata(); const cw = Math.floor(m.width! / 4), H = m.height!;
  const xs = await Promise.all([0, 1, 2, 3].map(async (i) => { const b = await sharp(png).extract({ left: i * cw, top: 0, width: cw, height: H }).ensureAlpha().raw().toBuffer(); let sx = 0, n = 0; for (let y = 0; y < H / 2; y++) for (let x = 0; x < cw; x++) if (b[(y * cw + x) * 4 + 3]) { sx += x; n++; } return n ? sx / n : 0; }));
  return +(Math.max(...xs) - Math.min(...xs)).toFixed(1);
}
const rows: Record<string, unknown>[] = [];
let usd = 0;
for (const [name, desc, size] of SET) {
  const t0 = Date.now();
  const row: Record<string, unknown> = { name, size };
  const c = await makeCharacter(desc, size);
  usd += c.usd; row.create = c.ok; row.createUsd = +c.usd.toFixed(4); row.createFacts = c.facts;
  if (!c.ok) { row.createWhy = c.reason; rows.push(row); console.log(JSON.stringify(row)); continue; }
  writeFileSync(`${OUT}/${name}-1x.png`, c.png); writeFileSync(`${OUT}/${name}-raw.png`, c.raw);
  row.createSpecks = await specks(c.png);
  for (const mv of ["turn", "walk"] as const) {
    const m = await makeMotion(c.png, mv);
    usd += m.usd;
    row[mv] = m.ok; row[`${mv}Tries`] = m.tries; row[`${mv}Usd`] = +m.usd.toFixed(4); row[`${mv}Facts`] = m.check?.facts; row[`${mv}Judge`] = m.check?.judge?.why;
    if ("raw" in m && m.raw) writeFileSync(`${OUT}/${name}-${mv}-raw.png`, m.raw);
    if (m.ok) { const s = await sheetOf(m.cuts, m.set); writeFileSync(`${OUT}/${name}-${mv}-1x.png`, s); row[`${mv}Specks`] = await specks(s); row[`${mv}Cell`] = [m.set.cellW, m.set.cellH]; row[`${mv}Drift`] = await drift(s); if (mv === "walk") row.walkHead = +(headFlicker(m.cuts, m.set) * 100).toFixed(0); }
    else row[`${mv}Why`] = m.reason;
  }
  row.sec = ((Date.now() - t0) / 1000).toFixed(0);
  rows.push(row); console.log(JSON.stringify(row));
  writeFileSync(`${OUT}/result.json`, JSON.stringify(rows, null, 2));
}
const fail = rows.filter((r) => !r.create || !r.turn || !r.walk).length;
const slid = rows.filter((r) => Number(r.walkDrift ?? 0) > 1.5).map((r) => r.name);
const flick = rows.filter((r) => Number(r.walkHead ?? 0) > 25).map((r) => `${r.name}(${r.walkHead}%)`);
const shrunk = rows.filter((r) => ((r.createFacts as string[]) ?? []).some((f) => f.includes("줄임"))).map((r) => r.name);
const spk = rows.reduce((s, r) => s + Number(r.createSpecks ?? 0) + Number(r.turnSpecks ?? 0) + Number(r.walkSpecks ?? 0), 0);
console.log(`\n기계 실패(결과 없음) 캐릭터 ${fail}/${rows.length} · 하늘색 점 합 ${spk} · 걷기 미끄러짐(>1.5칸) ${slid.length ? slid.join(",") : "없음"} · 캔버스에 억지로 줄임 ${shrunk.length ? shrunk.join(",") : "없음"} · 걷기 머리 깜빡임(>25%) ${flick.length ? flick.join(",") : "없음"} · 합계 $${usd.toFixed(4)}`);
// 사람 눈 확인용 한 장: 줄마다 [만들기 | 4방향 | 걷기]
const S = 2, comp: sharp.OverlayOptions[] = []; let y = 0, W = 0;
for (const r of rows) {
  let x = 0, hmax = 0;
  for (const f of [`${r.name}-1x.png`, `${r.name}-turn-1x.png`, `${r.name}-walk-1x.png`]) {
    const p = `${OUT}/${f}`; if (!existsSync(p)) { x += 120; continue; }
    const m = await sharp(p).metadata(); const b = await sharp(p).resize(m.width! * S, m.height! * S, { kernel: "nearest" }).png().toBuffer();
    comp.push({ input: b, left: x, top: y }); x += m.width! * S + 24; hmax = Math.max(hmax, m.height! * S);
  }
  W = Math.max(W, x); y += hmax + 16;
}
await sharp({ create: { width: Math.max(W, 10), height: Math.max(y, 10), channels: 4, background: "#ffffff" } }).composite(comp).png().toFile(`${OUT}/bench-all.png`);
console.log("ok");
