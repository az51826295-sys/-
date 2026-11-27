import sharp from "sharp";
const [f, n, k, y0] = process.argv.slice(2);
const s = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const cw = s.info.width / Number(n);
for (let y = Number(y0); y < s.info.height; y++) { let l = ""; for (let x = 0; x < cw; x++) { const i = (y * s.info.width + Number(k) * cw + x) * 4; if (!s.data[i + 3]) { l += "."; continue; } const r = s.data[i], g = s.data[i + 1], b = s.data[i + 2]; l += b > r + 20 ? "B" : r > b + 30 ? (r + g > 300 ? "y" : "w") : "k"; } console.log(String(y).padStart(2), l.slice(20, 76)); }
