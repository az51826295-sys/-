/**
 * 두근도트 **실제 사용량** — 값을 정하기 전에 근거를 깐다 (10-25).
 *
 * 새 DB 는 이사 때 `dot_usage`·`dot_turns` 가 안 들어가 비어 있다. 그래서 **덤프**를 읽는다.
 * 덤프는 옛 프로젝트에서 10-24 에 통째로 꺼낸 것이라, 서비스 시작부터 그날까지가 다 들어 있다.
 *
 * **표본이 작다는 것을 먼저 적는다.** 22명·695줄로 정하는 값은 추정이지 측정이 아니다.
 */
import { readFileSync } from "node:fs";

const 뿌리 = "C:/Users/az518/Desktop/ai-workforce";
const d = JSON.parse(readFileSync(뿌리 + "/engine/work/dot-이사/dot-dump.json", "utf8"));
const 무료 = 30;            // FREE_TURNS_PER_DAY
const 광고충전 = 2 * 10;     // AD_REFILLS_PER_DAY * AD_REFILL_TURNS

const usage = d.dot_usage ?? [];
const turns = d.dot_turns ?? [];
const msgs = d.dot_messages ?? [];
const users = d.auth_users ?? [];

console.log("── 표본");
console.log("   계정 " + users.length + "명 · 사용 기록 " + usage.length + "줄(사람×날) · 턴 " + turns.length + "건 · 말 " + msgs.length + "줄");

/* ── 하루에 몇 번 말하나 ── */
const 하루들 = usage.map((u) => u.turns ?? 0).filter((n) => n > 0).sort((a, b) => a - b);
const 몫 = (p) => 하루들.length ? 하루들[Math.min(하루들.length - 1, Math.floor(하루들.length * p))] : 0;
const 평균 = 하루들.length ? (하루들.reduce((a, b) => a + b, 0) / 하루들.length) : 0;
console.log("\n── 하루에 몇 번 말하나 (말한 날만, " + 하루들.length + "일치)");
console.log("   평균 " + 평균.toFixed(1) + "회 · 가운데값 " + 몫(0.5) + " · 상위25% " + 몫(0.75) + " · 상위10% " + 몫(0.9) + " · 최대 " + (하루들[하루들.length - 1] ?? 0));

/* ── 무료 한도에 닿나 ── */
const 닿음 = 하루들.filter((n) => n >= 무료).length;
const 넘음 = 하루들.filter((n) => n > 무료).length;
const 광고까지 = 하루들.filter((n) => n >= 무료 + 광고충전).length;
console.log("\n── 무료 한도(하루 " + 무료 + "회, 광고로 +" + 광고충전 + ")");
console.log("   한도에 닿은 날 " + 닿음 + "일 (" + (하루들.length ? (닿음 / 하루들.length * 100).toFixed(0) : 0) + "%)");
console.log("   넘긴 날        " + 넘음 + "일");
console.log("   광고까지 다 쓴 날 " + 광고까지 + "일");

/* ── 사람별 ── */
const 사람 = {};
for (const u of usage) { (사람[u.user_id] ??= []).push(u.turns ?? 0); }
const 사람들 = Object.values(사람);
const 총합 = 사람들.map((a) => a.reduce((x, y) => x + y, 0)).sort((a, b) => b - a);
console.log("\n── 사람별 (기록이 있는 " + 사람들.length + "명)");
console.log("   쓴 날 평균 " + (사람들.reduce((a, b) => a + b.length, 0) / (사람들.length || 1)).toFixed(1) + "일");
console.log("   총 턴 상위 5명: " + 총합.slice(0, 5).join(", "));
console.log("   총 턴 가운데값: " + (총합[Math.floor(총합.length / 2)] ?? 0));
const 한번만 = 사람들.filter((a) => a.length === 1).length;
console.log("   **하루만 쓰고 안 온 사람 " + 한번만 + "명** (" + (사람들.length ? (한번만 / 사람들.length * 100).toFixed(0) : 0) + "%)");

/* ── 돈 쓴 사람 ── */
console.log("\n── 결제");
console.log("   구매 기록 " + (d.dot_purchases ?? []).length + "건 · 지갑 " + (d.dot_wallet ?? []).length + "명 · 멘헤라 권한 " + (d.dot_entitlements ?? []).length + "명");
for (const p of d.dot_purchases ?? []) console.log("     " + p.sku + " · credits " + p.credits + " · menhera " + p.menhera_days + "일 · " + p.source);

/* ── 한 턴에 드는 돈 ── */
const 토큰 = turns.filter((t) => (t.input_tokens ?? 0) > 0);
if (토큰.length) {
  const inAvg = 토큰.reduce((a, t) => a + (t.input_tokens ?? 0), 0) / 토큰.length;
  const outAvg = 토큰.reduce((a, t) => a + (t.output_tokens ?? 0), 0) / 토큰.length;
  console.log("\n── 한 턴 평균 토큰 (" + 토큰.length + "건): 들어감 " + Math.round(inAvg) + " · 나옴 " + Math.round(outAvg));
}
