// 남은 배경색 칸이 어디에 어떻게 붙어 있나(돈 0). npx tsx speck_debug.mts <png>
import sharp from "sharp";
const { data, info } = await sharp(process.argv[2]).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, BG = [0xb0, 0xc4, 0xde];
const near = (q: number) => { const i = q * 4; return data[i + 3] > 0 && Math.abs(data[i] - BG[0]) + Math.abs(data[i + 1] - BG[1]) + Math.abs(data[i + 2] - BG[2]) < 48; };
const seen = new Uint8Array(W * H);
for (let s = 0; s < W * H; s++) {
  if (seen[s] || !near(s)) continue;
  const comp: number[] = [], st = [s]; seen[s] = 1;
  while (st.length) { const q = st.pop()!; comp.push(q); const x = q % W, y = (q - x) / W; for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) { if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const k = ny * W + nx; if (!seen[k] && near(k)) { seen[k] = 1; st.push(k); } } }
  const q = comp[0], i = q * 4;
  console.log(`덩어리 ${comp.length}칸 @(${q % W},${Math.floor(q / W)}) 색(${data[i]},${data[i + 1]},${data[i + 2]}) 알파 ${data[i + 3]} · 프레임 ${Math.floor((q % W) / (W / 4)) + 1}`);
}
