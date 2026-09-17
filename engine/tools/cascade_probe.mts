/**
 * 예외 하나가 검사 여러 줄을 덮는 것을 접는 자 (122회차 09-15). 돈 0, 유니티 0, 서버 안 부름.
 *   npx tsx engine/tools/cascade_probe.mts
 *
 * 실제 기록에서 그대로 가져온 모양을 되살린다: `InvalidOperationException: Avatar is null.` 하나가
 * 서로 다른 검사 4줄(그림·조명·씬 열림·카메라)을 동시에 떨어뜨렸다(그런 줄이 13건).
 * 접은 뒤: 실패 1 + 못 잼 3 이어야 하고, **서로 다른 원인은 따로 남아야** 한다(다 접어 버리면 그것도 고장이다).
 */
type Case = { name: string; result: string; message?: string | null };

// 서버(api/unity/checks)와 **같은 셈**. 바뀌면 여기도 같이 바꾼다.
function collapse(cases: Case[], counts: { passed: number; failed: number; inconclusive: number }) {
  const rootOf = (c: Case): string | null => {
    const t = (c.message ?? "").trim();
    if (c.result !== "Failed") return null;
    const m = t.match(/Unhandled log message:\s*'?\[(?:Exception|Error)\]\s*([^']{10,160}?)\s*(?:\.|')/);
    return m ? m[1].trim() : null;
  };
  const seen = new Map<string, number>();
  for (const c of cases) { const r = rootOf(c); if (r) seen.set(r, (seen.get(r) ?? 0) + 1); }
  const shared = new Set([...seen.entries()].filter(([, n]) => n > 1).map(([r]) => r));
  const kept = new Set<string>();
  for (const c of cases) {
    const r = rootOf(c);
    if (!r || !shared.has(r)) continue;
    if (!kept.has(r)) { kept.add(r); continue; }
    c.result = "Inconclusive";
    c.message = `앞의 예외(${r.slice(0, 80)}) 때문에 재지 못했다 — 그 예외를 고치면 이 줄은 다시 잰다`;
    counts.failed = Math.max(0, counts.failed - 1);
    counts.inconclusive += 1;
  }
  return { cases, counts };
}

let bad = 0;
const check = (name: string, ok: boolean, got?: unknown) => { if (!ok) bad++; console.log(ok ? "통과" : "실패", name, ok ? "" : JSON.stringify(got)); };

// ── 고장 재현: 실제 기록 그대로
const AVATAR = "Unhandled log message: '[Exception] InvalidOperationException: Avatar is null.'. Use UnityEngine.TestTools.LogAssert.Expect";
const real: Case[] = [
  { name: "그림이_코드가_아니라_파일에서_온다", result: "Failed", message: AVATAR },
  { name: "삼차원이면_조명이_있다", result: "Failed", message: AVATAR },
  { name: "씬이_열리고_예외가_없다", result: "Failed", message: AVATAR },
  { name: "카메라와_보이는_것이_있다", result: "Failed", message: AVATAR },
  { name: "입력을_주면_무언가_움직인다", result: "Passed", message: null },
];
const r1 = collapse(real, { passed: 1, failed: 4, inconclusive: 0 });
check("접기 전 4줄이 같은 예외였다 → 실패 1 · 못 잼 3", r1.counts.failed === 1 && r1.counts.inconclusive === 3, r1.counts);
check("첫 줄만 진짜 실패로 남는다", r1.cases[0].result === "Failed" && r1.cases.slice(1, 4).every((c) => c.result === "Inconclusive"), r1.cases.map((c) => c.result));
check("통과한 줄은 안 건드린다", r1.cases[4].result === "Passed");
check("못 잼 줄에 원인을 적었다", (r1.cases[1].message ?? "").includes("Avatar is null"), r1.cases[1].message);

// ── 반대편(이것이 없으면 다 접어 버리는 자다): 서로 다른 원인은 따로 남는다
const two: Case[] = [
  { name: "a", result: "Failed", message: "Unhandled log message: '[Exception] NullReferenceException: 어쩌고 저쩌고.'" },
  { name: "b", result: "Failed", message: "Unhandled log message: '[Exception] NullReferenceException: 어쩌고 저쩌고.'" },
  { name: "c", result: "Failed", message: "Unhandled log message: '[Exception] MissingComponentException: 다른 원인이다 정말로.'" },
];
const r2 = collapse(two, { passed: 0, failed: 3, inconclusive: 0 });
check("원인 둘이면 실패 2로 남는다(다 접지 않는다)", r2.counts.failed === 2 && r2.counts.inconclusive === 1, r2.counts);

// ── 예외가 아닌 진짜 실패는 절대 안 접는다
const genuine: Case[] = [
  { name: "규격_조각_크기", result: "Failed", message: "조각이 붙은 자리 크기의 0.01배" },
  { name: "기대_head_count", result: "Failed", message: "실측 6.295, 기대 6.3~6.3" },
  { name: "컴파일이_된다", result: "Failed", message: "컴파일 오류 6개" },
];
const r3 = collapse(genuine, { passed: 0, failed: 3, inconclusive: 0 });
check("예외가 아닌 실패 3건은 그대로 3건", r3.counts.failed === 3 && r3.cases.every((c) => c.result === "Failed"), r3.counts);

console.log(bad ? `\n실패 ${bad}` : "\n전부 통과");
process.exitCode = bad ? 1 : 0;
