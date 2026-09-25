/**
 * **예측 점수 자**(213회차 09-25). 최근 실행들이 재기 전에 적은 예측(metrics_json.predictions)과 잰 값을 모아
 * Brier 평균·칸별 오차 평균을 낸다 — "똑똑한가" 의 숫자. 덤으로 머리의 견적("약 $X · Y분")도 실제와 견준다.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/predict_score.mts [일수=14]
 */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const days = Number(process.argv[2] ?? 14);
const { data } = await db.from("work_executions").select("id, created_at, updated_at, metrics_json, status").gte("created_at", new Date(Date.now() - days * 864e5).toISOString()).order("created_at", { ascending: false }).limit(500);
type P = { round: number; 통과확률: number; 채점?: { brier: number; 통과: boolean; 오차: Record<string, number>; 견줌: number } };
let n = 0, brierSum = 0, passRight = 0; const err: Record<string, number[]> = {};
let estN = 0, estUsdErr = 0, estMinErr = 0;
for (const r of (data ?? []) as Record<string, any>[]) {
  const m = (r.metrics_json ?? {}) as Record<string, any>;
  for (const p of ((m.predictions ?? []) as P[])) {
    if (!p.채점) continue;
    n++; brierSum += p.채점.brier; if ((p.통과확률 >= 0.5) === p.채점.통과) passRight++;
    for (const [k, v] of Object.entries(p.채점.오차)) (err[k] ??= []).push(v);
  }
  // 머리 견적 vs 실제
  const est = String(m.decision?.estimate ?? "");
  const mu = est.match(/\$\s?([0-9.]+)/), mm = est.match(/([0-9.]+)\s*분/);
  if ((mu || mm) && r.status === "completed") {
    const { data: u } = await db.from("model_usage").select("cost_usd").eq("work_execution_id", r.id);
    const usd = (u ?? []).reduce((a: number, x: any) => a + Number(x.cost_usd ?? 0), 0);
    const min = (new Date(r.updated_at).getTime() - new Date(r.created_at).getTime()) / 60000;
    estN++; if (mu) estUsdErr += Math.abs(Number(mu[1]) - usd); if (mm) estMinErr += Math.abs(Number(mm[1]) - min);
  }
}
console.log(`최근 ${days}일 · 채점된 예측 ${n}개`);
if (n) {
  console.log(`  Brier 평균 ${(brierSum / n).toFixed(3)} (0 이 완벽, 0.25 가 동전 던지기) · 통과/실패 방향 맞음 ${passRight}/${n}`);
  for (const [k, v] of Object.entries(err)) console.log(`  ${k}: 오차 평균 ${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)} (${v.length}회)`);
} else console.log("  아직 없다 — 예측자가 서버에 올라간 뒤의 고리부터 쌓인다.");
console.log(`머리 견적 ${estN}건: 값 오차 평균 $${estN ? (estUsdErr / estN).toFixed(3) : "-"} · 시간 오차 평균 ${estN ? (estMinErr / estN).toFixed(1) : "-"}분`);
