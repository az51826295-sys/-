// 11-27 "발만 움직인다" 자: 걷기 시트에서 허리 아래·위가 프레임 사이에 몇 % 바뀌나(돈 0)
//   npx tsx motion_amount.mts <walk-1x.png> <허리 줄> [장수=6]
import sharp from "sharp";
const [p, hipS, nS] = process.argv.slice(2); const hip = Number(hipS), n = Number(nS ?? 6);
const { data, info } = await sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const cw = Math.floor(info.width / n), H = info.height, W = info.width;
const px = (f: number, x: number, y: number) => { const i = (y * W + f * cw + x) * 4; return data[i + 3] ? (data[i] << 16) | (data[i + 1] << 8) | data[i + 2] : -1; };
// 몸 전체 1칸 내려앉기(dip)는 '움직임'으로 세지 않는다 — 위아래 0·±1칸 밀어 가장 적게 바뀐 값
const part = (y0: number, y1: number) => { let ch = 0, tot = 0; for (let f = 0; f < n; f++) { const g = (f + 1) % n; let best = [1e9, 1]; for (const sh of [0, 1, -1]) { let c = 0, t = 0; for (let y = y0; y < y1; y++) { const yb = y + sh; if (yb < 0 || yb >= H) continue; for (let x = 0; x < cw; x++) { const a = px(f, x, y), b = px(g, x, yb); if (a < 0 && b < 0) continue; t++; if (a !== b) c++; } } if (c < best[0]) best = [c, t]; } ch += best[0]; tot += best[1]; } return tot ? (100 * ch) / tot : 0; };
let bot = -1; for (let y = H - 1; y >= 0 && bot < 0; y--) for (let x = 0; x < cw; x++) if (px(0, x, y) >= 0) { bot = y; break; }
console.log(`${p.split("/").slice(-2).join("/")} · 허리 아래 바뀜 ${part(hip, H).toFixed(0)}% · 발(맨 아래 ${Math.round((bot - hip) * 0.3)}줄 빼고) 허리~무릎 ${part(hip, bot - Math.round((bot - hip) * 0.3)).toFixed(0)}% · 허리 위 ${part(0, hip).toFixed(0)}%`);
