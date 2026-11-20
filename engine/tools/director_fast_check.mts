/**
 * 빠른 길 자 — 장부가 답하면 판단자를 안 부르고, 답 못 하면 반드시 부르나.
 * 모델 0 · 돈 0. 가짜 판단자는 불린 횟수만 센다.
 *
 *   npx tsx engine/tools/director_fast_check.mts
 *
 * "안 불러야 할 때 안 부름" 만 재면 늘 장부로 가는 고장을 못 잡는다 → **불러야 할 때 부름**(대조) 칸을 같이 둔다.
 * 끝에 11-20 첫 판의 실제 장부를 순서대로 다시 흘려, 그 판에서 빠른 길이 몇 번 탔을지도 적는다.
 */
import { readFileSync } from "node:fs";
import { decide, fastPath, scorecard, type LedgerEntry, type Seat, type Effort } from "../../src/lib/director/index.ts";

let 불림 = 0;
const 가짜판단자 = {
  name: "fake", model: "fake",
  async generateStructuredOutput() {
    불림++;
    return { output: { seat: "gpt-5", effort: "보통", predictedPass: 0.7, estimate: "-", why: "-", risk: "-" }, model: "fake", inputTokens: 1000, outputTokens: 500 };
  },
} as never;

const seats: Seat[] = [
  { id: "gpt-5", outPerMTok: 10 },
  { id: "gpt-5.6-luna", outPerMTok: 1.2 },
  { id: "gpt-5-mini", outPerMTok: 2 },
];
const 줄 = (seat: string, kind: string, passed: boolean, usd = 0.01, effort: Effort = "보통"): LedgerEntry =>
  ({ at: "", task: "t", kind, seat, effort, predictedPass: 0.7, passed, usd });
const 반복 = (n: number, f: () => LedgerEntry) => Array.from({ length: n }, f);

let 맞음 = 0, 틀림 = 0;
async function 칸(이름: string, ledger: LedgerEntry[], kind: string, 기대: { via: "장부" | "판단자"; seat?: string }) {
  const 전 = 불림;
  const d = await decide(가짜판단자, { task: "x", kind, seats, ledger }, () => 0.024);
  const 불렸나 = 불림 - 전;
  const ok = d.via === 기대.via && (기대.seat ? d.seat === 기대.seat : true) &&
    (기대.via === "장부" ? 불렸나 === 0 && d.usd === 0 : 불렸나 === 1);
  ok ? 맞음++ : 틀림++;
  console.log(`${ok ? "✅" : "❌"} ${이름} → ${d.via}/${d.seat}/${d.effort} 예측 ${d.predictedPass} · 판단자 ${불렸나}번 · $${d.usd}`);
}

// 장부가 답해야 하는 칸
await 칸("luna 게임 5/5", 반복(5, () => 줄("gpt-5.6-luna", "게임", true)), "게임", { via: "장부", seat: "gpt-5.6-luna" });
await 칸("둘 다 넘으면 장부상 싼 쪽", [...반복(5, () => 줄("gpt-5", "게임", true, 0.05)), ...반복(5, () => 줄("gpt-5.6-luna", "게임", true, 0.008))], "게임", { via: "장부", seat: "gpt-5.6-luna" });
await 칸("목록 단가가 아니라 실제 돈", [...반복(5, () => 줄("gpt-5-mini", "게임", true, 0.004)), ...반복(5, () => 줄("gpt-5.6-luna", "게임", true, 0.02))], "게임", { via: "장부", seat: "gpt-5-mini" });
await 칸("9/10 · 실패가 오래전", [줄("gpt-5.6-luna", "앱", false), ...반복(9, () => 줄("gpt-5.6-luna", "앱", true))], "앱", { via: "장부", seat: "gpt-5.6-luna" });

// 판단자를 불러야 하는 칸(대조)
await 칸("빈 장부(첫날 손님)", [], "게임", { via: "판단자" });
await 칸("4판뿐", 반복(4, () => 줄("gpt-5.6-luna", "게임", true)), "게임", { via: "판단자" });
await 칸("4/5", [줄("gpt-5.6-luna", "게임", false), ...반복(4, () => 줄("gpt-5.6-luna", "게임", true))], "게임", { via: "판단자" });
await 칸("9/10 · 마지막이 실패", [...반복(9, () => 줄("gpt-5.6-luna", "게임", true)), 줄("gpt-5.6-luna", "게임", false)], "게임", { via: "판단자" });
await 칸("다른 종류의 성적", 반복(8, () => 줄("gpt-5.6-luna", "게임", true)), "문서", { via: "판단자" });
await 칸("목록에 없는 AI 의 성적", 반복(8, () => 줄("deepseek", "게임", true)), "게임", { via: "판단자" });
await 칸("결과 안 온 줄은 안 셈", 반복(6, () => ({ ...줄("gpt-5.6-luna", "게임", true), passed: undefined })), "게임", { via: "판단자" });

// 노력: 통과한 판에서 제일 많이 쓴 것
{
  const d = fastPath(seats, [...반복(3, () => 줄("gpt-5.6-luna", "게임", true, 0.01, "가볍게")), ...반복(2, () => 줄("gpt-5.6-luna", "게임", true, 0.01, "꼼꼼히"))], "게임");
  const ok = d?.effort === "가볍게"; ok ? 맞음++ : 틀림++;
  console.log(`${ok ? "✅" : "❌"} 노력은 통과한 판의 최빈값 → ${d?.effort}`);
}

// 성적표: 판단 몫·아낀 어림
{
  const L = [...반복(4, () => ({ ...줄("gpt-5.6-luna", "게임", true, 0.006), via: "판단자" as const, judgeUsd: 0.024 })), ...반복(6, () => ({ ...줄("gpt-5.6-luna", "게임", true, 0.006), via: "장부" as const, judgeUsd: 0 }))];
  const s = scorecard(L, { seats, baseline: "gpt-5" });
  const 기대아낌 = 10 * (0.006 * (10 / 1.2) - 0.006);
  const ok = s.장부로 === 6 && Math.abs(s.판단값 - 0.096) < 1e-9 && Math.abs((s.아낀어림 ?? 0) - 기대아낌) < 1e-9;
  ok ? 맞음++ : 틀림++;
  console.log(`${ok ? "✅" : "❌"} 성적표: 장부로 ${s.장부로} · 판단값 $${s.판단값.toFixed(3)} · 판단몫 ${Math.round((s.판단몫 ?? 0) * 100)}% · 아낀 어림 $${s.아낀어림?.toFixed(3)}`);
}

// ── 11-21 강화: 떠보기 · 올리기 · 실력 ──
const 봄 = (이름: string, ok: boolean, 보임: string) => { ok ? 맞음++ : 틀림++; console.log(`${ok ? "✅" : "❌"} ${이름} → ${보임}`); };
{
  const d = fastPath(seats, 반복(9, () => 줄("gpt-5", "게임", true)), "게임");
  봄("10번째 판은 바로 아래 싼 자리를 떠봄", d?.via === "탐색" && d.seat === "gpt-5-mini", `${d?.via}/${d?.seat} 예측 ${d?.predictedPass}`);
  const d2 = fastPath(seats, 반복(5, () => 줄("gpt-5", "게임", true)), "게임");
  봄("떠볼 차례가 아니면 굳은 자리(대조)", d2?.via === "장부" && d2.seat === "gpt-5", `${d2?.via}/${d2?.seat}`);
  const d3 = fastPath(seats, [...반복(7, () => 줄("gpt-5", "게임", true)), ...반복(2, () => 줄("gpt-5-mini", "게임", false))], "게임");
  봄("최근 떨어진 자리는 안 떠봄", d3?.via === "탐색" && d3.seat === "gpt-5.6-luna", `${d3?.via}/${d3?.seat}`);
  const d4 = fastPath(seats, 반복(9, () => 줄("gpt-5.6-luna", "게임", true)), "게임");
  봄("제일 싼 자리에 굳었으면 떠볼 데가 없다(대조)", d4?.via === "장부" && d4.seat === "gpt-5.6-luna", `${d4?.via}/${d4?.seat}`);
}
{
  const { escalate } = await import("../../src/lib/director/index.ts");
  const f = (seat: string, effort: Effort = "보통") => ({ ...줄(seat, "고침", false), effort });
  const e1 = escalate(seats, [], f("gpt-5.6-luna"));
  봄("luna 가 떨어지면 한 칸 위(mini)", e1?.via === "올림" && e1.seat === "gpt-5-mini", `${e1?.seat}/${e1?.effort}`);
  const e2 = escalate(seats, 반복(2, () => 줄("gpt-5-mini", "고침", false)), f("gpt-5.6-luna"));
  봄("위 칸이 이 종류에서 나쁘면 건너뜀(gpt-5)", e2?.seat === "gpt-5", `${e2?.seat}`);
  const e3 = escalate(seats, [], f("gpt-5"));
  봄("맨 위가 떨어지면 공들이기를 올림", e3?.seat === "gpt-5" && e3.effort === "꼼꼼히", `${e3?.seat}/${e3?.effort}`);
  const e4 = escalate(seats, [], f("gpt-5", "꼼꼼히"));
  봄("더 갈 데가 없으면 사람에게(null)", e4 === null, String(e4));
}
{
  const 다통과 = scorecard(반복(6, () => 줄("gpt-5.6-luna", "게임", true)));
  봄("실패가 없으면 실력은 못 잼(null), 0 이 아니다", 다통과.실력 === null, String(다통과.실력));
  const 잘맞힘 = scorecard([...반복(4, () => ({ ...줄("a", "k", true), predictedPass: 0.9 })), ...반복(4, () => ({ ...줄("a", "k", false), predictedPass: 0.1 }))]);
  봄("갈리는 판을 맞히면 실력 양수", (잘맞힘.실력 ?? 0) > 0.5, `${잘맞힘.실력?.toFixed(2)}`);
  const 거꾸로 = scorecard([...반복(4, () => ({ ...줄("a", "k", true), predictedPass: 0.2 })), ...반복(4, () => ({ ...줄("a", "k", false), predictedPass: 0.8 }))]);
  봄("거꾸로 맞히면 실력 음수(대조)", (거꾸로.실력 ?? 0) < 0, `${거꾸로.실력?.toFixed(2)}`);
}

// 11-20 첫 판의 실제 장부를 순서대로 다시 흘린다 — 빠른 길이 몇 번 탔을까
{
  const r = JSON.parse(readFileSync("engine/work/head-ab/results.json", "utf8")) as { 장부: LedgerEntry[] };
  const 장부 = r.장부 ?? [];
  let 탔다 = 0;
  for (let i = 0; i < 장부.length; i++) if (fastPath(seats, 장부.slice(0, i), 장부[i].kind)) 탔다++;
  const 종류 = [...new Set(장부.map((e) => e.kind))].map((k) => `${k} ${장부.filter((e) => e.kind === k).length}`).join(" · ");
  console.log(`ℹ️  첫 판 장부 ${장부.length}줄(${종류}) 다시 흘림 → 빠른 길 ${탔다}번 (한 종류가 5판을 못 채웠다)`);
}

console.log(`\n${맞음}/${맞음 + 틀림}`);
process.exit(틀림 ? 1 : 0);
