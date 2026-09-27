/**
 * **왜 규칙 후보가 검증을 못 넘나 — 깔때기를 센다** (226회차 2026-09-27/28).
 *
 *   npx tsx engine/tools/rookery_env.mts engine/tools/rule_funnel.mts
 *
 * 어제 잰 것: 후보 58개 중 채택 5개(**9%**). 재료는 흐른다(최근 30일 판정 202건).
 * 그러면 막힌 곳은 재료가 아니라 **문 사이 어딘가**다. 어느 문에서 죽는지 세지 않고
 * 프롬프트를 손대면 헛수고다 — 오늘 그런 걸 네 번 접었다.
 *
 * 문은 네 개다(`ruleStats.ts` 의 `ADOPT`):
 *   ① **제안자가 어긴 사례를 3건 이상 못 댔다** — 판정 호출도 안 한다(낭비 막이)
 *   ② 어기고 **실패한** 사례 2건 미만 — 성공만 어기는 규칙은 실패의 원인이 아니다
 *   ③ 효과(lift) 0.2 미만
 *   ④ 우연일 수 있음 (p > 0.1)
 *
 * ①에서 많이 죽으면 **제안자**를 고쳐야 하고, ③④에서 죽으면 **문턱이나 표본**을 봐야 한다.
 * 둘은 손대는 곳이 완전히 다르다. 그래서 **갈라 센다**([[count-paths-and-split-the-tally]]).
 */
import { createServiceClient } from "../../src/lib/supabase/service";

const db = createServiceClient();
const { data, error } = await db
  .from("learning_candidates")
  .select("title, status, reason, manager_note, created_at")
  .order("created_at", { ascending: false })
  .limit(1000);
if (error) {
  // 오류를 읽는다 — 0 을 "없다" 로 적지 않는다([[zero-can-mean-i-cannot-see]]).
  console.error("후보를 못 읽었다 — 멈춘다:", error.message);
  process.exit(1);
}
type C = { title: string; status: string; reason: string | null; manager_note: string | null; created_at: string };
const cs = (data ?? []) as C[];
console.log(`후보 ${cs.length}개\n`);

/** 적힌 이유를 문 하나로 옮긴다. 문자열 검사만 쓴다 — 오늘 정규식 백슬래시가 네 번 접혔다. */
function 어느문(r: string | null): string {
  const t = r ?? "";
  if (!t) return "이유가 안 적혔다";
  if (t.includes("판정 안 함") || t.includes("밖에 못 댔다")) return "① 제안자가 어긴 사례를 못 댔다";
  if (t.includes("판단 불가")) return "① 어긴 사례 3건 미만 (판정까지 갔다)";
  if (t.includes("어기고 실패한 사례")) return "② 어기고 실패한 사례가 적다";
  if (t.includes("효과 lift")) return "③ 효과가 작다 (lift)";
  if (t.includes("우연일 수 있음")) return "④ 우연일 수 있다 (p)";
  if (t.includes("채택")) return "통과";
  if (t.includes("호출 실패")) return "판정 호출이 떨어졌다";
  return `그 밖: ${t.slice(0, 40)}`;
}

const 상태 = new Map<string, number>();
for (const c of cs) 상태.set(c.status, (상태.get(c.status) ?? 0) + 1);
console.log(`상태: ${[...상태].sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s} ${n}`).join(" · ")}\n`);

const 문셈 = new Map<string, number>();
for (const c of cs) 문셈.set(어느문(c.reason), (문셈.get(어느문(c.reason)) ?? 0) + 1);
console.log("어느 문에서 죽나:");
for (const [g, n] of [...문셈].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(3)}개 (${((n * 100) / cs.length).toFixed(0)}%) · ${g}`);
}

// ③④ 에서 죽은 것은 **간신히 떨어졌나** 를 본다. 문턱 바로 밑이면 표본이 모자란 것이고,
// 한참 밑이면 규칙이 실제로 효과가 없는 것이다. 이 구분이 다음에 손댈 곳을 정한다.
console.log("\n③④ 에서 죽은 것들의 숫자 (문턱: lift 0.20 · p 0.10):");
const 숫자든것 = cs.filter((c) => (c.reason ?? "").includes("lift") || (c.reason ?? "").includes("p="));
for (const c of 숫자든것.slice(0, 20)) {
  console.log(`  · ${(c.reason ?? "").slice(0, 56).padEnd(56)} ${c.title.slice(0, 34)}`);
}
if (!숫자든것.length) {
  console.log("  하나도 없다 — **아무 후보도 통계 문까지 못 갔다.** 그러면 손댈 곳은 문턱이 아니라 제안자다.");
}

console.log("\n통과한 것:");
for (const c of cs.filter((c) => (c.reason ?? "").includes("채택")).slice(0, 10)) {
  console.log(`  · ${c.title.slice(0, 40)} — ${(c.reason ?? "").slice(0, 50)}`);
}
console.log("\n호출 0번 · 값 0원. 이미 산 기록을 읽은 것뿐이다.");
