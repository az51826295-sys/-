// 11-27 "망토가 다리 옆으로 내려와 바닥까지 닿나" — 다리 틈 길이 대신 쓸 자 후보(돈 0)
// 몸 아래 30% 줄에서 다리 띠(다리 x 범위 ±여유) 밖에 칠한 칸 / 띠 안 칸. 망토·치마가 바닥까지 늘어지면 크다.
import sharp from "sharp";
const { findLegs } = await import("../../../../src/lib/pixel/rigwalk");
const D = "C:/Users/az518/Desktop/두근도트-스레드";
for (const n of process.argv.slice(2)) {
  const p = n.includes("/") ? n : `${D}/itch-pack4/${n}/front.png`;
  const { data, info } = await sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const L = findLegs(data, W, H);
  if (!L) { console.log(n, "다리 없음"); continue; }
  const bh = L.bot - L.top + 1, pad = Math.max(2, Math.round(bh / 12));
  const b0 = Math.max(0, L.Lx[0] - pad), b1 = Math.min(W - 1, L.Rx[1] + pad);
  let inB = 0, outB = 0;
  for (let y = L.bot - Math.round(bh * 0.3); y <= L.bot; y++) for (let x = 0; x < W; x++) if (data[(y * W + x) * 4 + 3]) { if (x < b0 || x > b1) outB++; else inB++; }
  console.log(`${n.split("/").slice(-2).join("/").padEnd(18)} 다리 틈 ${((100 * (L.bot - L.hip + 1)) / bh).toFixed(0)}% · 띠 x${b0}~${b1} · 아래 30%에서 띠 밖/안 = ${outB}/${inB} = ${(outB / Math.max(1, inB)).toFixed(2)}`);
}
