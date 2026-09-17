/**
 * 검증된 규칙 고리 자 (100회차 09-14). 돈 0.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/genesis_rule_probe.mts
 * 1) 셈(피셔·lift·채택 문턱) 2) 보류분 나누기가 날마다 같은가 3) 목(mock) 모델로 실제 사례에 대해 고리 전체를 **쓰지 않고**(dryRun) 한 바퀴
 * 4) genesis_runs 표가 앱(서비스 키)에서 보이는가.
 */
const { countsFrom, fisherOneSided, decide, isHoldout, lift } = await import("../../src/lib/genesis/ruleStats");
const { runRuleLoop, recheckDue, RECHECK } = await import("../../src/lib/genesis/ruleLoop");
const { createMockAIProvider } = await import("../../src/lib/providers/mock");
const { createServiceClient } = await import("../../src/lib/supabase/service");

let bad = 0;
const check = (name: string, ok: boolean, got?: unknown) => { if (!ok) bad++; console.log(ok ? "통과" : "실패", name, ok ? "" : JSON.stringify(got)); };

// 1) 셈
const perfect = { a: 4, b: 0, c: 0, d: 4 };
check("피셔: 완벽한 분리 4/4 → p≈0.014", Math.abs(fisherOneSided(perfect) - 1 / 70) < 1e-9, fisherOneSided(perfect));
check("피셔: 무관(2,2,2,2) → p>0.5", fisherOneSided({ a: 2, b: 2, c: 2, d: 2 }) > 0.5, fisherOneSided({ a: 2, b: 2, c: 2, d: 2 }));
check("lift: 완벽 분리 = 1", lift(perfect) === 1);
check("lift: 어긴 사례 없으면 null", lift({ a: 0, b: 0, c: 3, d: 3 }) === null);
check("채택: 완벽 분리", decide(perfect).adopt, decide(perfect));
check("기각: 어긴 사례 2건뿐", !decide({ a: 2, b: 0, c: 1, d: 5 }).adopt, decide({ a: 2, b: 0, c: 1, d: 5 }));
check("기각: 효과 작음", !decide({ a: 3, b: 5, c: 3, d: 6 }).adopt, decide({ a: 3, b: 5, c: 3, d: 6 }));
check("기각: 우연일 수 있음(작은 표본)", !decide({ a: 2, b: 1, c: 1, d: 1 }).adopt, decide({ a: 2, b: 1, c: 1, d: 1 }));
check("countsFrom 칸 배치", JSON.stringify(countsFrom([{ bad: true, violates: true }, { bad: false, violates: true }, { bad: true, violates: false }, { bad: false, violates: false }])) === JSON.stringify({ a: 1, b: 1, c: 1, d: 1 }));

// 2) 보류분 나누기
const ids = Array.from({ length: 1000 }, (_, i) => `c:${i}`);
const share = ids.filter(isHoldout).length / ids.length;
check(`보류분 비율 ≈40% (${(share * 100).toFixed(1)}%)`, share > 0.34 && share < 0.46, share);
check("같은 id 는 늘 같은 쪽", ids.slice(0, 50).every((id) => isHoldout(id) === isHoldout(id)));
check(`재검증: 보류분이 ${RECHECK.growth}건 늘기 전엔 안 함`, !recheckDue(60, 60 + RECHECK.growth - 1) && recheckDue(60, 60 + RECHECK.growth));

// 3) 목 모델로 실제 사례에 한 바퀴(쓰지 않음)
const db = createServiceClient();
const { data: cos } = await db.from("companies").select("id, name");
for (const co of (cos ?? []) as { id: string; name: string | null }[]) {
  const r = await runRuleLoop(db, createMockAIProvider(), co.id, { dryRun: true });
  console.log(`회사 ${(co.name ?? "").slice(0, 16)} 사례`, JSON.stringify(r.cases), r.skipped ? `건너뜀: ${r.skipped}` : `호출 ${r.calls} · 채택 ${r.adopted} · 기록 ${r.wrote}`);
  for (const t of r.trials) console.log("   ", t.adopt ? "채택" : "기각", t.title, JSON.stringify(t.counts), t.reason);
  check(`dryRun 은 쓰지 않음(${(co.name ?? "").slice(0, 10)})`, r.wrote === false);
  if (!r.skipped) {
    check(`재검증 안 될 때는 0건(${(co.name ?? "").slice(0, 10)})`, r.rechecks.length === 0, r.rechecks);
    // 강제 재검증(dryRun): 채택된 규칙이 있으면 새 판정이 나온다. 목 판정으로는 어긴 사례가 없어 "내림" 쪽이 나오지만 쓰지는 않는다.
    const f = await runRuleLoop(db, createMockAIProvider(), co.id, { dryRun: true, forceRecheck: true });
    for (const rc of f.rechecks) console.log("    재검증(강제·dryRun)", rc.keep ? "유지" : "내림", rc.title, JSON.stringify(rc.counts), rc.reason);
    check(`강제 재검증은 채택 규칙 수만큼(≤${RECHECK.maxPerRun}) 돌고 쓰지 않음`, f.rechecks.length <= RECHECK.maxPerRun && f.wrote === false && f.calls === r.calls + f.rechecks.length, { n: f.rechecks.length, calls: [r.calls, f.calls] });
  }
}

// 4) 표
const g = await db.from("genesis_runs").select("*", { count: "exact", head: true });
check("genesis_runs 표가 보임", !g.error, g.error?.message);

console.log(bad ? `실패 ${bad}` : "전부 통과");
process.exitCode = bad ? 1 : 0;
