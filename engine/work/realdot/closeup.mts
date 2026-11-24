/** 스레드용 확대 비교 한 장: AI 원본 vs 진짜 도트, 같은 자리를 크게. npx tsx engine/work/realdot/closeup.mts <png> <x> <y> <size> <out> */
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { realDot } from "../../../src/lib/pixel/realdot";

const [f, xs, ys, ss, out] = process.argv.slice(2);
const x = Number(xs), y = Number(ys), s = Number(ss);
const src = readFileSync(f);
const m = await sharp(src).metadata();
const r = await realDot(src, { colors: 32 });
// 칸 경계(cuts) 그대로 원본 크기에 다시 칠한다 — 같은 자리를 자르면 정확히 겹친다
const [cx, cy] = r.cuts;
const sm = await sharp(r.small).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = m.width!, H0 = m.height!;
const ix = new Int32Array(W), iy = new Int32Array(H0);
for (let i = 0; i < cx.length - 1; i++) for (let p = cx[i]; p < cx[i + 1]; p++) ix[p] = i;
for (let j = 0; j < cy.length - 1; j++) for (let p = cy[j]; p < cy[j + 1]; p++) iy[p] = j;
const out4 = Buffer.alloc(W * H0 * 4);
for (let yy = 0; yy < H0; yy++) for (let xx = 0; xx < W; xx++) sm.data.copy(out4, (yy * W + xx) * 4, (iy[yy] * sm.info.width + ix[xx]) * 4, (iy[yy] * sm.info.width + ix[xx]) * 4 + 4);
const big = await sharp(out4, { raw: { width: W, height: H0, channels: 4 } }).png().toBuffer();
const P = 600;
const crop = (b: Buffer) => sharp(b).extract({ left: x, top: y, width: s, height: s }).resize(P, P, { kernel: "nearest" }).flatten({ background: "#fff" }).png().toBuffer();
const L = ["AI 원본 — 한 칸 안에 색이 섞여 있음", "진짜 도트 — 한 칸에 한 색"];
const CW = P * 2 + 30, CH = P + 80;
const svg = `<svg width="${CW}" height="${CH}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#fff"/>
${L.map((t, i) => `<text x="${10 + i * (P + 10) + P / 2}" y="48" font-family="Malgun Gothic" font-size="28" font-weight="bold" text-anchor="middle">${t}</text>`).join("")}</svg>`;
// 칸 경계 격자(같은 선을 두 판에) — 왼쪽은 선이 색을 가로지르고, 오른쪽은 선 사이가 한 색
const k = P / s;
const gx = cx.filter((c) => c > x && c < x + s).map((c) => (c - x) * k), gy = cy.filter((c) => c > y && c < y + s).map((c) => (c - y) * k);
const grid = Buffer.from(`<svg width="${P}" height="${P}" xmlns="http://www.w3.org/2000/svg">${gx.map((v) => `<line x1="${v}" y1="0" x2="${v}" y2="${P}" stroke="#00b4ff" stroke-opacity="0.75" stroke-width="2"/>`).join("")}${gy.map((v) => `<line x1="0" y1="${v}" x2="${P}" y2="${v}" stroke="#00b4ff" stroke-opacity="0.75" stroke-width="2"/>`).join("")}</svg>`);
const withGrid = async (b: Buffer) => sharp(await crop(b)).composite([{ input: grid }]).png().toBuffer();
const img = await sharp(Buffer.from(svg)).composite([await withGrid(src), await withGrid(big)].map((input, i) => ({ input, left: 10 + i * (P + 10), top: 70 }))).png().toBuffer();
writeFileSync(out, img);
console.log("도트", r.period, "칸", r.logical, "확대 배율", (P / s).toFixed(1));
