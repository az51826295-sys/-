// 오른쪽(게임 키로 다시 찍은 것)이 이상한가 — "외톨이 칸"(상하좌우 네 이웃과 색이 다 다른 칸) 비율을 잰다. 돈 0.
import { readFileSync } from "node:fs";
import sharp from "sharp";
process.env.PIXEL_CREATE_MOCK = "engine/work/realdot/motion/mock-one.png";
const { makeCharacter } = await import("../../../../src/lib/pixel/create");
const D = "C:/Users/az518/Desktop/두근도트-시트";
const game = [readFileSync(`${D}/taeo-strip.png`), readFileSync(`${D}/haru-strip.png`)];
async function lonely(png: Buffer) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const at = (x: number, y: number) => { if (x < 0 || y < 0 || x >= info.width || y >= info.height) return -1; const i = (y * info.width + x) * 4; return data[i + 3] ? (data[i] << 16) | (data[i + 1] << 8) | data[i + 2] : -1; };
  let n = 0, k = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) { const c = at(x, y); if (c < 0) continue; n++; if ([at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)].every((d) => d !== c)) k++; }
  // 바로 위 줄(옆 칸 줄)과 완전히 같은 줄 비율 — 칸을 1.6배로 늘리면 줄이 겹쳐 생긴다
  const row = (y: number) => Array.from({ length: info.width }, (_, x) => at(x, y)).join(",");
  const col = (x: number) => Array.from({ length: info.height }, (_, y) => at(x, y)).join(",");
  let dr = 0, rr = 0, dc = 0, cc = 0;
  for (let y = 1; y < info.height; y++) { const r = row(y); if (r.split(",").some((v) => v !== "-1")) { rr++; if (r === row(y - 1)) dr++; } }
  for (let x = 1; x < info.width; x++) { const c = col(x); if (c.split(",").some((v) => v !== "-1")) { cc++; if (c === col(x - 1)) dc++; } }
  return `외톨이 ${((100 * k) / n).toFixed(1)}% · 겹친 가로줄 ${dr}/${rr} · 겹친 세로줄 ${dc}/${cc}`;
}
const a = await makeCharacter("x", 64); // 왼쪽: AI 가 그린 격자 그대로
const b = await makeCharacter("x", 48, { game, snap: false }); // 오른쪽(맞춤 끔): 게임 키 58칸으로 다시 찍음
const c = await makeCharacter("x", 48, { game, snap: true }); // 오른쪽(맞춤 켬)
for (const [k, r] of [["왼쪽 그대로", a], ["다시 찍음", b], ["다시 찍음+팔레트", c]] as const) if (r.ok) console.log(k, await lonely(r.png), r.facts.join(" · "));
// 게임 원본(taeo 띠 첫 캐릭터)의 외톨이 비율 — 기준
const { realDot } = await import("../../../../src/lib/pixel/realdot");
console.log("게임 원본(taeo 띠)", await lonely((await realDot(game[0])).small));
