import fs from "node:fs";
import sharp from "sharp";
const f = process.argv[2];
const { data, info } = await sharp(fs.readFileSync(f)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, ch = info.channels;
let opaque = 0, semi = 0, clear = 0, white = 0, edgePix = 0, haloWhite = 0;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const p = (y * W + x) * ch, a = data[p + 3];
  if (a === 0) { clear++; continue; }
  if (a < 250) semi++; else opaque++;
  const nearWhite = data[p] > 235 && data[p+1] > 235 && data[p+2] > 235;
  if (nearWhite) white++;
  // 투명과 맞닿았나
  let edge = false;
  for (let dy = -1; dy <= 1 && !edge; dy++) for (let dx = -1; dx <= 1; dx++) {
    const nx = x+dx, ny = y+dy;
    if (nx<0||ny<0||nx>=W||ny>=H||data[(ny*W+nx)*ch+3]===0) { edge = true; break; }
  }
  if (edge) { edgePix++; if (nearWhite) haloWhite++; }
}
const ink = opaque + semi;
console.log(`${f.split("/").pop()}  ${W}×${H}`);
console.log(`  그림 ${ink} · 투명 ${clear} · **반투명 ${semi}** (${(semi/ink*100).toFixed(1)}%)`);
console.log(`  거의 흰 화소 ${white} (${(white/ink*100).toFixed(1)}%)`);
console.log(`  테두리 화소 ${edgePix} · 그중 흰 것 ${haloWhite} (${edgePix?(haloWhite/edgePix*100).toFixed(1):0}%)  ← 흰 테두리가 남았나`);
