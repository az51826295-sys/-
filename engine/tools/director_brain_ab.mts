/**
 * 싼 판단자 실험 — 설계·판정식: engine/docs/director-cheap-brain-design.md (잠금 5f13710).
 *
 *   npx tsx engine/tools/director_brain_ab.mts
 *
 * A: gpt-5 가 판단자로 정했던 15판을 그때 장부 그대로 후보에게 다시 준다. B: 올려야 하는 세 판(규칙 정답).
 * 결과: engine/work/director-brain/results.json
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim().replace(/\r$/, "");
}
const { decideFor } = await import("../../src/lib/director/index.ts");
const { seatProvider } = await import("../../src/lib/skills/appBuild/seats.ts");
const { costOf } = await import("../../src/lib/costs/pricing.ts");
type Seat = import("../../src/lib/director/index.ts").Seat;
type LedgerEntry = import("../../src/lib/director/index.ts").LedgerEntry;

const OUT = "engine/work/director-brain"; mkdirSync(OUT, { recursive: true });
const 기준 = "gpt-5", 후보 = ["gpt-5.6-luna", "gpt-5-mini"];

/* A — 결과를 아는 판 */
type Case = { name: string; task: string; kind: string; seats: Seat[]; ledger: LedgerEntry[]; ranSeat: string; passed: boolean; gpt5Pred: number };
const A: Case[] = [];
{
  const 오늘 = JSON.parse(readFileSync(join(homedir(), ".rookery/director/ledger.json"), "utf8")) as (LedgerEntry & { id: string })[];
  const 자리 = JSON.parse(readFileSync(join(homedir(), ".rookery/director/seats.json"), "utf8")) as Seat[];
  오늘.forEach((e, i) => { if (e.via === "judge" || (e.via as string) === "판단자") A.push({ name: `오늘${i + 1}`, task: e.task, kind: e.kind, seats: 자리, ledger: 오늘.slice(0, i), ranSeat: e.seat, passed: !!e.passed, gpt5Pred: e.predictedPass }); });
  const r = JSON.parse(readFileSync("engine/work/head-ab/results.json", "utf8")) as { 장부: LedgerEntry[] };
  const 자리2 = JSON.parse(readFileSync("engine/work/head-ab/seats.json", "utf8")) as Seat[];
  r.장부.forEach((e, i) => A.push({ name: `첫판${i + 1}`, task: e.task, kind: e.kind, seats: 자리2, ledger: r.장부.slice(0, i), ranSeat: e.seat, passed: !!e.passed, gpt5Pred: e.predictedPass }));
}

/* B — 올려야 하는 판 */
const 줄 = (seat: string, kind: string, passed: boolean): LedgerEntry => ({ at: "", task: "지난 일", kind, seat, effort: "normal", predictedPass: 0.7, passed, usd: 0.01 });
const 클로드 = JSON.parse(readFileSync(join(homedir(), ".rookery/director/seats.json"), "utf8")) as Seat[];
const 오픈 = JSON.parse(readFileSync("engine/work/head-ab/seats.json", "utf8")) as Seat[];
const B: { name: string; task: string; kind: string; seats: Seat[]; ledger: LedgerEntry[]; ok: (seat: string) => boolean }[] = [
  { name: "B1 haiku 게임 0/5", task: "터치로 하는 리듬 게임, 점수와 콤보 표시.", kind: "게임", seats: 클로드,
    ledger: Array.from({ length: 5 }, () => 줄("haiku", "게임", false)), ok: (s) => s !== "haiku" },
  { name: "B2 luna 고침 1/6", task: "벽돌깨기에서 공이 패들을 뚫고 지나가. 고쳐.", kind: "고침", seats: 오픈,
    ledger: [줄("gpt-5.6-luna", "고침", true), ...Array.from({ length: 5 }, () => 줄("gpt-5", "고침", true)), ...Array.from({ length: 5 }, () => 줄("gpt-5.6-luna", "고침", false))], ok: (s) => s !== "gpt-5.6-luna" },
  { name: "B3 그림을 봐야 함", task: "첨부한 스크린샷에서 단추 세 개의 줄맞춤이 틀렸다. 스크린샷을 보고 어느 단추가 어긋났는지 찾아 CSS 를 고쳐.", kind: "고침",
    seats: [{ id: "cheap-blind", outPerMTok: 0.5, note: "그림 못 봄." }, { id: "mid", outPerMTok: 5, sees: true, note: "그림을 본다." }], ledger: [], ok: (s) => s === "mid" },
];

/* 돌리기 */
let 돈 = 0;
async function 판단(brain: string, c: { task: string; kind: string; seats: Seat[]; ledger: LedgerEntry[] }) {
  const ai = await seatProvider(brain); if (!ai) throw new Error(`${brain} 못 앉힘`);
  const d = await decideFor(ai, c, (u) => { const v = costOf({ backend: u.model, inputTokens: u.inputTokens, outputTokens: u.outputTokens }); 돈 += v; return v; });
  return d;
}
const 결과: Record<string, unknown[]> = {};
for (const b of 후보) {
  결과[b] = [];
  for (const c of A) { const d = await 판단(b, c); 결과[b].push({ part: "A", name: c.name, seat: d.seat, pred: d.predictedPass, usd: d.usd, guard: d.guard, ranSeat: c.ranSeat, passed: c.passed, gpt5Pred: c.gpt5Pred }); console.error(`${b} ${c.name} → ${d.seat} ${d.predictedPass} $${d.usd.toFixed(4)}${d.guard ? " 난간:" + d.guard : ""}`); }
}
for (const b of [기준, ...후보]) {
  결과[b] ??= [];
  for (const c of B) { const d = await 판단(b, c); 결과[b].push({ part: "B", name: c.name, seat: d.seat, pred: d.predictedPass, usd: d.usd, ok: c.ok(d.seat), why: d.why }); console.error(`${b} ${c.name} → ${d.seat} ${c.ok(d.seat) ? "맞음" : "틀림"} $${d.usd.toFixed(4)}`); }
}
writeFileSync(`${OUT}/results.json`, JSON.stringify(결과, null, 1));

/* 판정 (잠근 식 그대로) */
type R = { part: string; name: string; seat: string; pred: number; usd: number; ranSeat?: string; passed?: boolean; gpt5Pred?: number; ok?: boolean };
const gpt5B = (결과[기준] as R[]).filter((r) => r.part === "B");
const gpt5BUsd = gpt5B.reduce((a, r) => a + r.usd, 0) / gpt5B.length;
console.log(`기준 gpt-5 · B ${gpt5B.filter((r) => r.ok).length}/3 · B 판단 한 번 $${gpt5BUsd.toFixed(4)}`);
for (const b of 후보) {
  const rs = 결과[b] as R[], a = rs.filter((r) => r.part === "A"), bb = rs.filter((r) => r.part === "B");
  const 같음 = a.filter((r) => r.seat === r.ranSeat);
  const brier = (xs: number[], ys: boolean[]) => xs.reduce((s, x, i) => s + (x - (ys[i] ? 1 : 0)) ** 2, 0) / Math.max(1, xs.length);
  const 후보brier = brier(같음.map((r) => r.pred), 같음.map((r) => !!r.passed));
  const 기준brier = brier(같음.map((r) => r.gpt5Pred!), 같음.map((r) => !!r.passed));
  const 평균값 = rs.reduce((s, r) => s + r.usd, 0) / rs.length;
  const 조건 = [bb.every((r) => r.ok), 같음.length >= 12, 후보brier <= 기준brier + 0.05, 평균값 <= gpt5BUsd / 4];
  console.log(`${b}: B ${bb.filter((r) => r.ok).length}/3 · A 같은 자리 ${같음.length}/15 · Brier ${후보brier.toFixed(3)} vs gpt-5 ${기준brier.toFixed(3)} · 판단 한 번 $${평균값.toFixed(4)} → ${조건.every(Boolean) ? "선다" : "못 선다"} [${조건.map((x) => (x ? "✓" : "✗")).join("")}]`);
}
console.log(`전체 값 $${돈.toFixed(3)}`);
