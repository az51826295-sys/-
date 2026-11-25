// 예측자 → 판단자 → 고치기(돈 0): 4방향이 41칸으로 읽혔는데 참조는 63칸 → 예측 주기 = 12.4×41/63 근처에서 다시 찾는다.
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
const D = "C:/Users/az518/Desktop/두근도트-스레드/realdot/first-create";
const { realDot } = await import("../../../../src/lib/pixel/realdot");
const { findFrames, cutFrames, sheetOf } = await import("../../../../src/lib/pixel/frames");
const raw = readFileSync(`${D}/turn-raw.png`);
const a = await realDot(raw);
const sa = await findFrames(a.small);
const pred = (a.period[0] * sa.cellH) / 63;
console.log(`처음: 주기 ${a.period[0]} · 프레임 ${sa.frames.length} · 칸 ${sa.cellW}×${sa.cellH} → 예측 주기 ${pred.toFixed(2)}`);
const b = await realDot(raw, { near: pred });
const sb = await findFrames(b.small);
console.log(`근처에서: 주기 ${b.period[0]} · 프레임 ${sb.frames.length} · 칸 ${sb.cellW}×${sb.cellH}`);
const cuts = await cutFrames(b.small, sb, { lockBottom: 0 });
const s1 = await sheetOf(cuts, sb); const m = await sharp(s1).metadata();
writeFileSync(`${D}/turn-near-big.png`, await sharp(s1).resize(m.width! * 6, m.height! * 6, { kernel: "nearest" }).png().toBuffer());
