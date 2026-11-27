// 11-27 "미완성 느낌" 자(돈 0): 걷기 시트에서 ① 기본 그림에 없는 색 칸 비율 ② 몸에서 떨어진 3칸 이하 덩어리 수 ③ 이웃 장끼리 바뀐 칸 비율(반짝임)
//   npx tsx flicker_ruler.mts <front.png> <walk-1x.png> <장수>
import sharp from "sharp";
const [front, sheet, nS] = process.argv.slice(2); const n = Number(nS);
const b = await sharp(front).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const s = await sharp(sheet).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = b.info.width, H = b.info.height, SW = s.info.width;
const pal = new Set<number>(); for (let i = 0; i < b.data.length; i += 4) if (b.data[i + 3]) pal.add((b.data[i] << 16) | (b.data[i + 1] << 8) | b.data[i + 2]);
const px = (f: number, x: number, y: number) => { const i = (y * SW + f * W + x) * 4; return s.data[i + 3] ? (s.data[i] << 16) | (s.data[i + 1] << 8) | s.data[i + 2] : -1; };
let off = 0, tot = 0, specks = 0, ch = 0, chT = 0;
for (let f = 0; f < n; f++) {
  const seen = new Uint8Array(W * H); const sizes: number[] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = px(f, x, y); if (c < 0) continue; tot++; if (!pal.has(c)) off++; const d = px((f + 1) % n, x, y); if (c !== d) ch++; chT++;
    if (seen[y * W + x]) continue; const st = [[x, y]]; seen[y * W + x] = 1; let k = 0; while (st.length) { const [a, bb] = st.pop()!; k++; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = a + dx, Y = bb + dy; if (X < 0 || Y < 0 || X >= W || Y >= H || seen[Y * W + X] || px(f, X, Y) < 0) continue; seen[Y * W + X] = 1; st.push([X, Y]); } } sizes.push(k); }
  const big = Math.max(...sizes); specks += sizes.filter((k) => k <= 3 && k < big).length;
}
console.log(`없는 색 ${(off / tot * 100).toFixed(1)}% · 떨어진 점 ${specks}개 · 이웃 장 바뀐 칸 ${(ch / chT * 100).toFixed(1)}%`);
