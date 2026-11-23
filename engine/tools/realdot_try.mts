/** 실제 AI 그림에 돌려 보고 옛 pixelize 와 나란히 (11-24). npx tsx engine/tools/realdot_try.mts <png...> */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename } from "node:path";
import sharp from "sharp";
import { realDot } from "../../src/lib/pixel/realdot";
import { pixelize } from "../../src/lib/dot/sprites";
const OUT = "C:/Users/az518/Desktop/두근도트-스레드/realdot"; mkdirSync(OUT, { recursive: true });
for (const f of process.argv.slice(2)) {
  const src = readFileSync(f);
  const r = await realDot(src, { colors: 32 });
  const old = await pixelize(src, 128, 512);
  const H = 512;
  const a = await sharp(src).resize(H, H, { fit: "contain", background: "#fff" }).flatten({ background: "#fff" }).png().toBuffer();
  const b = await sharp(old).flatten({ background: "#fff" }).png().toBuffer();
  const c = await sharp(r.big).resize(H, H, { fit: "contain", kernel: "nearest", background: "#fff" }).flatten({ background: "#fff" }).png().toBuffer();
  const svg = `<svg width="${H * 3 + 40}" height="${H + 70}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#fff"/>
  ${["AI 원본", "옛 변환(128 격자)", `새 변환 · 도트 ${r.period[0]}px · ${r.logical.join("×")} · ${r.colors}색`].map((t, i) => `<text x="${10 + i * (H + 10) + H / 2}" y="40" font-family="Malgun Gothic" font-size="24" text-anchor="middle">${t}</text>`).join("")}</svg>`;
  const 판 = await sharp(Buffer.from(svg)).composite([a, b, c].map((input, i) => ({ input, left: 10 + i * (H + 10), top: 60 }))).png().toBuffer();
  writeFileSync(`${OUT}/${basename(f, ".png")}-cmp.png`, 판);
  // 얼굴 확대: 가운데 위쪽 1/3
  const z = async (buf: Buffer) => { const m = await sharp(buf).metadata(); const w = m.width!, h = m.height!; return sharp(buf).extract({ left: Math.round(w * 0.3), top: Math.round(h * 0.2), width: Math.round(w * 0.4), height: Math.round(h * 0.4) }).resize(H, H, { kernel: "nearest" }).png().toBuffer(); };
  const 판2 = await sharp(Buffer.from(svg)).composite([await z(a), await z(b), await z(c)].map((input, i) => ({ input, left: 10 + i * (H + 10), top: 60 }))).png().toBuffer();
  writeFileSync(`${OUT}/${basename(f, ".png")}-zoom.png`, 판2);
  console.log(basename(f), "도트", r.period, "칸", r.logical, "색", r.colors);
}
