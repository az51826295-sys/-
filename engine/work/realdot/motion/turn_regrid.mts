// 11-27 4방향 키: 작게 그린 원본(raw)을 **더 촘촘한 격자로 다시 읽기** vs 다 읽은 뒤 nearest 로 키우기 — 돈 0(저장한 raw 재사용)
//   npx tsx turn_regrid.mts knight v2 12.18 43
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
process.chdir("C:/Users/az518/Desktop/ai-workforce");
const D = "C:/Users/az518/Desktop/두근도트-스레드";
const { realDot } = await import("../../../../src/lib/pixel/realdot");
const { findFrames, cutFrames } = await import("../../../../src/lib/pixel/frames");
const { sheetOf } = await import("../../../../src/lib/pixel/motion");
const [n = "knight", tag = "v2", p0 = "12.18", h0 = "43"] = process.argv.slice(2);
const raw = readFileSync(`${D}/rival/${n}/turn-${tag}-raw.png`);
const fb = await sharp(`${D}/itch-pack4/${n}/front.png`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
let top = -1, bot = -1; for (let y = 0; y < fb.info.height; y++) for (let x = 0; x < fb.info.width; x++) if (fb.data[(y * fb.info.width + x) * 4 + 3]) { if (top < 0) top = y; bot = y; }
const want = bot - top + 1;
const period = (Number(p0) * Number(h0)) / want;
const rd = await realDot(raw, { colors: 32, period });
const set = await findFrames(rd.small, { cols: 4, rows: 1, valleys: true }).catch(() => findFrames(rd.small, { clearBg: true }));
const cuts = await cutFrames(rd.small, set, { dropEdgeBits: true });
const hs = cuts.map((c) => { let t = -1, b = -1; for (let y = 0; y < set.cellH; y++) for (let x = 0; x < set.cellW; x++) if (c[(y * set.cellW + x) * 4 + 3]) { if (t < 0) t = y; b = y; } return b - t + 1; });
writeFileSync(`${D}/rival/${n}/turn-${tag}-regrid.png`, await sheetOf(cuts, set));
console.log(`기본 키 ${want} · 격자 ${p0}→${period.toFixed(2)} · 다시 읽은 키 ${hs.join("/")} · 프레임 ${set.frames.length} · 색 ${rd.colors}`);
