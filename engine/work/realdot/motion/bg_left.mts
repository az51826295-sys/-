// 왜 하늘색 점이 남았나: 결과 1배 시트에서 배경색(#B0C4DE)과 가까운 칸을 거리별로 센다. 돈 0.
import sharp from "sharp";
const files = process.argv.slice(2);
const BG = [0xb0, 0xc4, 0xde];
for (const f of files) {
  const { data, info } = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const bins = [0, 0, 0, 0, 0]; const ex = new Map<string, number>(); let edge = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const i = (y * info.width + x) * 4; if (data[i + 3] < 128) continue;
    const d = Math.abs(data[i] - BG[0]) + Math.abs(data[i + 1] - BG[1]) + Math.abs(data[i + 2] - BG[2]);
    if (d < 100) {
      bins[Math.min(4, Math.floor(d / 20))]++;
      const k = `${data[i]},${data[i + 1]},${data[i + 2]}`; ex.set(k, (ex.get(k) ?? 0) + 1);
      const nb = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].some(([a, b]) => a < 0 || b < 0 || a >= info.width || b >= info.height || data[(b * info.width + a) * 4 + 3] < 128);
      if (nb) edge++;
    }
  }
  console.log(f.split("/").slice(-2).join("/"), "배경색과 거리 0-19/20-39/40-59/60-79/80-99:", bins.join("/"), "· 투명과 맞닿음", edge, "· 색", [...ex.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `(${k})×${v}`).join(" "));
}
