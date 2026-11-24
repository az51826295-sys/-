/**
 * 글로 캐릭터 만들기(src/lib/pixel/create.ts)의 자 (11-25). **모델 0 · 돈 0** — 목 그림을 "그려 온 것"으로 쓴다.
 *   npx tsx engine/tools/create_check.mts [--sabotage]
 * 기대(먼저 적음):
 *   ① taeo 한 명 · 48px → 받음, 48×48, 네 귀퉁이 투명, 캐릭터 칸 있음
 *   ② taeo strip(여러 명) → 안 받음(덩어리 ≠ 1)
 *   ③ taeo 한 명 · 32px → 받음, 32×32, AI 도트가 더 크면 "줄임" 사실이 적힘
 *   ④ 글로 쓴 동작이 비면 → 그리지 않고 안 받음(돈 0)
 * --sabotage: ①의 결과를 한 색 배경에 얹은 뒤 잰다(배경을 못 뺀 고장) → ①이 깨져야 한다.
 */
import { readFileSync } from "node:fs";
import sharp from "sharp";

const SAB = process.argv.includes("--sabotage");
const D = "C:/Users/az518/Desktop/두근도트-시트";
// 한 명 목: 11-25 실제 그림 AI 출력(한 색 배경)에서 첫 캐릭터만 잘라 낸 것 — 실제로 올 그림과 같은 꼴
const ONE = "engine/work/realdot/motion/mock-one.png";
const { makeCharacter } = await import("../../src/lib/pixel/create");
const { makeMotion } = await import("../../src/lib/pixel/motion");
let ok = 0, n = 0;
const expect = (name: string, pass: boolean, got: unknown) => { n++; if (pass) ok++; console.log(`${pass ? "✓" : "✗"} ${name}: ${JSON.stringify(got)}`); };
async function look(png: Buffer) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const a = (x: number, y: number) => data[(y * info.width + x) * 4 + 3];
  let solid = 0; for (let i = 3; i < data.length; i += 4) if (data[i]) solid++;
  return { w: info.width, h: info.height, cornersClear: [a(0, 0), a(info.width - 1, 0), a(0, info.height - 1), a(info.width - 1, info.height - 1)].every((v) => v === 0), solid };
}

process.env.PIXEL_CREATE_MOCK = ONE;
const a = await makeCharacter("test", 48);
if (a.ok) {
  const png = SAB ? await sharp(a.png).flatten({ background: "#B0C4DE" }).png().toBuffer() : a.png;
  const L = await look(png);
  expect("① 한 명 · 48px → 받음 · 귀퉁이 투명", L.w === 48 && L.h === 48 && L.cornersClear && L.solid > 48 * 48 * 0.1, { ...L, facts: a.facts });
} else expect("① 한 명 · 48px → 받음", false, a);

process.env.PIXEL_CREATE_MOCK = `${D}/taeo-strip.png`;
const b = await makeCharacter("test", 48);
expect("② 여러 명 → 안 받음", !b.ok, b.ok ? b.facts : { reason: b.reason, facts: b.facts });

process.env.PIXEL_CREATE_MOCK = ONE;
const c = await makeCharacter("test", 32);
if (c.ok) { const L = await look(c.png); expect("③ 32px → 32×32 · 줄임 사실", L.w === 32 && L.h === 32 && (c.drawn[1] <= 32 || c.facts.some((f) => f.includes("줄임"))), { ...L, facts: c.facts }); }
else expect("③ 32px → 받음", false, c);

const d = await makeMotion(readFileSync(`${D}/taeo-neutral.png`), "custom", { action: "   " });
expect("④ 빈 동작 글 → 안 그림", !d.ok && d.usd === 0 && d.tries === 0, d.ok ? "받음" : { reason: d.reason, tries: d.tries });
console.log(`\n${ok}/${n}`);
