/** 남은 티끌은 왜 안 걸렸나 — 걸러낸 조건 중 무엇에서 떨어졌는지 하나씩 적는다. 11-08. */
import sharp from "sharp";
import { toLab, deltaE, DELTA_E, L_ABOVE, ALPHA_MIN } from "../../../src/lib/dot/fringe";

const 밑 = "C:/Users/az518/Desktop/로키-도트/티끌-20261108";
for (const [슬러그, 감정] of [["rin", "neutral"], ["yuna", "neutral"]] as const) {
  const png = await sharp(`${밑}/${슬러그}/${감정}.png`).png().toBuffer();   // 이미 한 번 지운 것
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const t = 8, W = info.width, ch = info.channels;
  const 가로 = Math.floor(W / t), 세로 = Math.floor(info.height / t);
  const 색: (null | [number, number, number])[] = [];
  for (let gy = 0; gy < 세로; gy++) for (let gx = 0; gx < 가로; gx++) {
    const p = ((gy * t + (t >> 1)) * W + gx * t + (t >> 1)) * ch;
    색.push(data[p + 3] >= ALPHA_MIN ? [data[p], data[p + 1], data[p + 2]] : null);
  }
  const lab = 색.map((c) => (c ? toLab(c[0], c[1], c[2]) : null));
  const L들 = lab.filter(Boolean).map((l) => l![0]).sort((a, b) => a - b);
  const 가운데L = L들[Math.floor(L들.length / 2)];

  /* 배경에서부터 몇 칸 들어왔나 */
  const 거리 = new Int32Array(가로 * 세로).fill(-1);
  const 줄: number[] = [];
  for (let i = 0; i < 가로 * 세로; i++) if (!색[i]) { 거리[i] = 0; 줄.push(i); }
  for (let h = 0; h < 줄.length; h++) {
    const q = 줄[h], x = q % 가로, y = (q / 가로) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= 가로 || ny >= 세로) continue;
      const k = ny * 가로 + nx;
      if (거리[k] < 0) { 거리[k] = 거리[q] + 1; 줄.push(k); }
    }
  }

  console.log(`\n${슬러그} ${감정} — 가운데 밝기 L=${가운데L.toFixed(0)} · 티끌 기준 L>${(가운데L + L_ABOVE).toFixed(0)} · ΔE>${DELTA_E}`);
  const 밝은것: string[] = [];
  for (let i = 0; i < 가로 * 세로; i++) {
    if (!색[i] || lab[i]![0] <= 가운데L + L_ABOVE) continue;
    const x = i % 가로, y = (i / 가로) | 0;
    let 가까움 = Infinity, 이웃수 = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= 가로 || ny >= 세로) continue;
      const k = ny * 가로 + nx;
      if (색[k]) { 이웃수++; 가까움 = Math.min(가까움, deltaE(lab[i]!, lab[k]!)); }
    }
    const 왜 = 거리[i] > 1 ? `배경에서 ${거리[i]}칸 안쪽이라 테두리가 아님` : 가까움 <= DELTA_E ? `이웃과 색이 비슷(ΔE ${가까움.toFixed(1)})` : "걸려야 하는데 남음";
    밝은것.push(`  (${x},${y}) L=${lab[i]![0].toFixed(0)} 깊이=${거리[i]} 이웃${이웃수} ΔE=${가까움 === Infinity ? "-" : 가까움.toFixed(1)} → ${왜}`);
  }
  console.log(밝은것.length ? 밝은것.slice(0, 40).join("\n") : "  밝은 칸 없음");
  console.log(`  밝은 칸 ${밝은것.length}개`);
}
