// 테두리 닿음이 어느 쪽에 몇 칸인가(돈 0). npx tsx border_sides.mts <raw.png>
import sharp from "sharp";
const { realDot } = await import("../../../../src/lib/pixel/realdot");
const rd = await realDot(process.argv[2] as unknown as Buffer);
const { data, info } = await sharp(rd.small).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height;
const corner = [data[0], data[1], data[2]];
const fg = (x: number, y: number) => { const i = (y * W + x) * 4; return data[i + 3] >= 128 && Math.abs(data[i] - corner[0]) + Math.abs(data[i + 1] - corner[1]) + Math.abs(data[i + 2] - corner[2]) >= 30; };
let top = 0, bot = 0, left = 0, right = 0;
for (let x = 0; x < W; x++) { if (fg(x, 0)) top++; if (fg(x, H - 1)) bot++; }
for (let y = 0; y < H; y++) { if (fg(0, y)) left++; if (fg(W - 1, y)) right++; }
console.log(`${W}×${H} 위 ${top} · 아래 ${bot} · 왼쪽 ${left} · 오른쪽 ${right}`);
