/**
 * "게임 추가"(게임 그림체로 만들기)의 자 (11-25). **모델 0 · 돈 0** — 목 그림을 "그려 온 것"으로 쓴다.
 *   npx tsx engine/tools/style_check.mts [--sabotage]
 * 기대(먼저 적음):
 *   (11-25 고침: 키 차이가 15% 넘으면 다시 찍지 않는다 — 사장님 "오른쪽 도트 이상한데")
 *   ① 게임 = taeo·haru 띠(58칸), 목 그림 36칸, 팔레트 맞춤 켬 → 받음 · 키 36 그대로 · "그대로 둠" 사실 · 보이는 색이 전부 게임 팔레트 안
 *   ② 같은데 팔레트 맞춤 끔 → 받음 · 키 36 그대로 · 팔레트 밖 색이 있다(맞춤이 실제로 일을 한다는 대조)
 *   ⑤ 게임 = 키 40칸 1배 스프라이트(36과 10% 차) → 키 40으로 맞춤 · "맞춤" 사실
 *   ③ 게임 그림이 캐릭터 없는 그림(한 색 판) → 그리기 전에 안 받음 · 돈 0
 *   ④ 이미 1배인 작은 스프라이트도 게임 그림으로 읽힌다(키가 원래 칸 수 그대로)
 * --sabotage: ①을 팔레트 맞춤 끔으로 돌린다(맞춤이 고장 난 경우) → ①이 깨져야 한다.
 */
import { readFileSync } from "node:fs";
import sharp from "sharp";

const SAB = process.argv.includes("--sabotage");
const D = "C:/Users/az518/Desktop/두근도트-시트";
const ONE = "engine/work/realdot/motion/mock-one.png";
process.env.PIXEL_CREATE_MOCK = ONE;
const { makeCharacter } = await import("../../src/lib/pixel/create");
const { profileOf } = await import("../../src/lib/pixel/style");
let ok = 0, n = 0;
const expect = (name: string, pass: boolean, got: unknown) => { n++; if (pass) ok++; console.log(`${pass ? "✓" : "✗"} ${name}: ${JSON.stringify(got)}`); };
async function look(png: Buffer) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const cols = new Set<number>(); let top = -1, bot = -1;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) { const i = (y * info.width + x) * 4; if (!data[i + 3]) continue; cols.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]); if (top < 0) top = y; bot = y; }
  return { w: info.width, h: bot - top + 1, cols };
}
const game = [readFileSync(`${D}/taeo-strip.png`), readFileSync(`${D}/haru-strip.png`)];
const prof = await profileOf(game);
const palSet = new Set(prof.palette.map((c) => (c[0] << 16) | (c[1] << 8) | c[2]));
console.log(`게임 프로필: 키 ${prof.height}칸 · 팔레트 ${prof.palette.length}색 · 캐릭터 ${prof.figures}`);

const a = await makeCharacter("test", 48, { game, snap: !SAB });
if (a.ok) {
  const L = await look(a.png); const out = [...L.cols].filter((c) => !palSet.has(c)).length;
  expect("① 차이 큼 → 키 그대로 · 팔레트 밖 0색", L.h === a.drawn[1] && a.facts.some((f) => f.includes("그대로 둠")) && out === 0, { canvas: a.size, h: L.h, gameH: prof.height, colors: L.cols.size, outside: out, facts: a.facts });
} else expect("① 받음", false, a);

const b = await makeCharacter("test", 48, { game, snap: false });
if (b.ok) {
  const L = await look(b.png); const out = [...L.cols].filter((c) => !palSet.has(c)).length;
  expect("② 맞춤 끔 → 키 그대로 · 팔레트 밖 색 있음", L.h === b.drawn[1] && out > 0, { h: L.h, outside: out });
} else expect("② 받음", false, b);

const flat = await sharp({ create: { width: 300, height: 300, channels: 4, background: "#88aa66" } }).png().toBuffer();
const c = await makeCharacter("test", 48, { game: [flat] });
expect("③ 캐릭터 없는 게임 그림 → 그리기 전 거절 · 돈 0", !c.ok && c.usd === 0, c.ok ? "받음" : { reason: c.reason });

const tiny = await sharp(a.ok ? a.png : readFileSync(ONE)).png().toBuffer(); // 캔버스 크기 1배 스프라이트
const tp = await profileOf([tiny]);
const tl = await look(tiny);
expect("④ 1배 스프라이트 → 키 그대로", tp.height === tl.h, { profileH: tp.height, real: tl.h });
// ⑤ 가까운 키의 게임: a 결과(36칸)를 40칸으로 키운 1배 스프라이트를 "게임 그림"으로
if (a.ok) {
  const g40 = await sharp(a.png).trim().resize({ height: 40, kernel: "nearest" }).png().toBuffer();
  const e = await makeCharacter("test", 48, { game: [g40] });
  if (e.ok) { const L = await look(e.png); expect("⑤ 10% 차 → 게임 키 40으로 맞춤", L.h === 40 && e.facts.some((f) => f.includes("다시 찍음") || f.includes("맞춤")), { h: L.h, facts: e.facts }); }
  else expect("⑤ 받음", false, e);
}
console.log(`\n${ok}/${n}`);
