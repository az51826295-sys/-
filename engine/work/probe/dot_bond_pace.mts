/** 친밀도 **속도** — 말로 하지 말고 돌려 본다. 하루 N턴씩 매일 올 때 며칠에 몇 단계인가. */
import { applyTurn, stageFor, type BondState } from "../../../src/lib/dot/bond.js";
const 하루턴 = [3, 10, 30];
for (const 턴 of 하루턴) {
  let st: BondState = { points: 0, stage: 1, streakDays: 0, lastTalkedOn: null };
  const 닿은날: Record<number, number> = {};
  for (let d = 1; d <= 60; d++) {
    const day = new Date(Date.UTC(2026, 0, d)).toISOString().slice(0, 10);
    for (let i = 0; i < 턴; i++) st = applyTurn(st, day, "오늘 뭐 했어? 나는 학교 갔다 왔어").next;
    const s = stageFor(st.points);
    if (!닿은날[s]) 닿은날[s] = d;
  }
  console.log(`하루 ${String(턴).padStart(2)}턴 · 60일 뒤 ${st.points}점(${st.stage}단계) — ` +
    [2, 3, 4, 5].map((s) => `${s}단계 ${닿은날[s] ? `${닿은날[s]}일` : "못 닿음"}`).join(" · "));
}
/* 선물만 산다면 */
let g: BondState = { points: 0, stage: 1, streakDays: 0, lastTalkedOn: null };
let n = 0;
while (g.stage < 5 && n < 500) { g = applyTurn(g, "2026-01-01", "선물", { name: "소금빵", points: 16, liked: true }).next; n++; }
console.log(`좋아하는 선물(+16)만 연타하면 5단계까지 ${n}번`);
