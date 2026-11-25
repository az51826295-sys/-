// 걷기 시트가 실제로 움직이나: 프레임끼리 다른 칸 비율(같은 자리), 아래 1/3(다리)만 따로. 돈 0.
import { readdirSync } from "node:fs";
import sharp from "sharp";
const D = process.argv[2];
for (const f of readdirSync(D).filter((x) => x.endsWith("-walk-1x.png"))) {
  const p = `${D}/${f}`; const m = await sharp(p).metadata(); const cw = Math.floor(m.width! / 4), H = m.height!;
  const fr = await Promise.all([0, 1, 2, 3].map((i) => sharp(p).extract({ left: i * cw, top: 0, width: cw, height: H }).ensureAlpha().raw().toBuffer()));
  const diff = (a: Buffer, b: Buffer, y0: number) => { let n = 0, d = 0; for (let y = y0; y < H; y++) for (let x = 0; x < cw; x++) { const i = (y * cw + x) * 4; if (!a[i + 3] && !b[i + 3]) continue; n++; if (a[i + 3] !== b[i + 3] || Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 40) d++; } return n ? (100 * d) / n : 0; };
  const all = [1, 2, 3].map((k) => diff(fr[0], fr[k], 0).toFixed(0)).join("/");
  const legs = [1, 2, 3].map((k) => diff(fr[0], fr[k], Math.floor(H * 0.66)).toFixed(0)).join("/");
  console.log(f.replace("-walk-1x.png", ""), `1번과 다른 칸 % 전체 ${all} · 다리(아래 1/3) ${legs}`);
}
