// 지금까지 받은 동작 원본 전부에서 새 자르기 표시(테두리 닿음 · 골짜기 줄에 걸친 칸)가 얼마나 켜지나 — 거짓 경보 세기. 돈 0.
import { readdirSync } from "node:fs";
const { realDot } = await import("../../../../src/lib/pixel/realdot");
const { findFrames } = await import("../../../../src/lib/pixel/frames");
const R = "C:/Users/az518/Desktop/두근도트-스레드/realdot/bench";
let n = 0, border = 0, sliced = 0;
for (const r of ["r1", "r2", "r3"]) for (const f of readdirSync(`${R}/${r}`).filter((x) => /-(turn|walk)-raw\.png$/.test(x))) {
  const rd = await realDot(`${R}/${r}/${f}` as unknown as Buffer);
  let a = "", b = "";
  try { const s = await findFrames(rd.small, { clearBg: true }); a = `자동 ${s.frames.length}개${s.touchesBorder ? " 테두리닿음" : ""}`; if (s.touchesBorder) border++; } catch { a = "자동 실패"; }
  try { const s = await findFrames(rd.small, { cols: 4, rows: 1, valleys: true }); b = `골짜기 걸침 ${s.sliced}`; if ((s.sliced ?? 0) > 0) sliced++; } catch { b = "골짜기 실패"; }
  n++; if (a.includes("테두리") || !b.endsWith(" 0")) console.log(r, f, a, b);
}
console.log(`원본 ${n}장 · 테두리 닿음 ${border} · 골짜기 걸침 ${sliced}`);
