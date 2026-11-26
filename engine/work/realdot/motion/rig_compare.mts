// 걷기 전/후(11-26): 왼쪽 = 지금 팩(그림 AI 걷기) · 오른쪽 = 기본 그림을 코드로 움직인 걷기(rigwalk). 돈 0.
//   PACK_ROOT=... npx tsx engine/work/realdot/motion/rig_compare.mts → <ROOT>/rig/<이름>-walk-1x.png · walk-compare.gif · .mp4
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { rigWalk } from "../../../../src/lib/pixel/rigwalk";
import { headFlicker } from "../../../../src/lib/pixel/motion";
const ROOT = process.env.PACK_ROOT || "C:/Users/az518/Desktop/두근도트-스레드/itch-pack2";
const NAMES = process.argv.slice(2).length ? process.argv.slice(2) : ["knight", "mage", "archer", "rogue", "priest", "merchant", "slime", "goblin", "skeleton", "bat"];
mkdirSync(`${ROOT}/rig`, { recursive: true });
const S = 3, CW = 80 * S, CH = 84 * S;
const tiles: { old: Buffer[]; nu: Buffer[]; ow: number; oh: number; nw: number; nh: number; name: string }[] = [];
for (const n of NAMES) {
  const r = await rigWalk(await sharp(`${ROOT}/${n}/front.png`).png().toBuffer());
  const sheet = await sharp({ create: { width: r.cellW * 4, height: r.cellH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(r.frames.map((input, i) => ({ input, raw: { width: r.cellW, height: r.cellH, channels: 4 as const }, left: i * r.cellW, top: 0 }))).png().toBuffer();
  writeFileSync(`${ROOT}/rig/${n}-walk-1x.png`, sheet);
  const hf = headFlicker(r.frames, { cellW: r.cellW, cellH: r.cellH } as never);
  console.log(n.padEnd(9), r.mode, `머리 바뀜 ${(hf * 100).toFixed(0)}%`, r.facts.join(" · "));
  // 옛 걷기 프레임
  const om = await sharp(`${ROOT}/${n}/walk-1x.png`).metadata(); const ocw = Math.floor(om.width! / 4);
  const old = await Promise.all([0, 1, 2, 3].map((f) => sharp(`${ROOT}/${n}/walk-1x.png`).extract({ left: f * ocw, top: 0, width: ocw, height: om.height! }).resize(ocw * S, om.height! * S, { kernel: "nearest" }).png().toBuffer()));
  // 새 걷기: 칠한 범위로 잘라 바닥선 맞추기 쉽게
  const nu = await Promise.all(r.frames.map((f) => sharp(f, { raw: { width: r.cellW, height: r.cellH, channels: 4 } }).resize(r.cellW * S, r.cellH * S, { kernel: "nearest" }).png().toBuffer()));
  tiles.push({ old, nu, ow: ocw * S, oh: om.height! * S, nw: r.cellW * S, nh: r.cellH * S, name: n });
}
// 한 화면: 줄마다 캐릭터 2개(옛·새) × 5줄 2칸
const COLS = 4, rowsN = Math.ceil((tiles.length * 2) / COLS), Wd = CW * COLS, Hd = CH * rowsN + 40;
const frames: Buffer[] = [];
for (let f = 0; f < 4; f++) {
  const comp: sharp.OverlayOptions[] = [{ input: Buffer.from(`<svg width="${Wd}" height="36"><text x="10" y="26" font-size="22" font-family="sans-serif" fill="#fff">왼쪽 = 지금(그림 AI 걷기)   오른쪽 = 고친 것(기본 그림을 코드로 움직임)</text></svg>`), left: 0, top: 0 }];
  tiles.forEach((t, k) => {
    for (const [j, which] of (["old", "nu"] as const).entries()) {
      const idx = k * 2 + j, col = idx % COLS, row = Math.floor(idx / COLS);
      const w = which === "old" ? t.ow : t.nw, hh = which === "old" ? t.oh : t.nh;
      // 옛 시트는 프레임 키에 맞춰 잘려 있고 새 것은 64칸 캔버스 → 둘 다 아래를 바닥선에
      comp.push({ input: t[which][f], left: col * CW + Math.max(0, Math.round((CW - w) / 2)), top: 40 + row * CH + Math.max(0, CH - 26 - hh) });
      comp.push({ input: Buffer.from(`<svg width="${CW}" height="22"><text x="${CW / 2}" y="17" text-anchor="middle" font-size="16" font-family="sans-serif" fill="${which === "old" ? "#999" : "#8fe"}">${t.name} ${which === "old" ? "지금" : "고침"}</text></svg>`), left: col * CW, top: 40 + row * CH + CH - 22 });
    }
  });
  frames.push(await sharp({ create: { width: Wd, height: Hd, channels: 4, background: { r: 60, g: 63, b: 70, alpha: 1 } } }).composite(comp).png().toBuffer());
}
const seq = [...frames, ...frames];
await sharp(seq, { join: { animated: true } }).gif({ delay: seq.map(() => 180), loop: 0 }).toFile(`${ROOT}/rig/walk-compare.gif`);
console.log("ok", Wd, Hd);
