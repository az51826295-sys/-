// 실행(앞 8자)의 metrics_json 에서 계획·결정·이어받기 흔적만. uuid 는 ilike 가 안 먹어 JS 에서 앞글자 맞춤.
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const { data: rows } = await db.from("work_executions").select("id, assignment_id, metrics_json, error_message").gte("created_at", new Date(Date.now() - 864e5).toISOString());
for (const pre of process.argv.slice(2)) {
  const r = ((rows ?? []) as Record<string, any>[]).find((x) => String(x.id).startsWith(pre));
  if (!r) { console.log(pre, "없음"); continue; }
  const m = (r.metrics_json ?? {}) as Record<string, any>;
  console.log(`--- ${pre} 일 ${String(r.assignment_id).slice(0, 8)} · metrics 키: ${Object.keys(m).join(",")}`);
  const steps = (m.steps ?? {}) as Record<string, any>;
  console.log("  steps 키:", Object.keys(steps).join(","));
  const plan = steps.plan; if (plan) console.log("  plan:", JSON.stringify({ target: plan.target, stage: plan.stage, small: plan.small, touch: plan.touch, title: plan.title, n: plan.criteria?.length }));
  if (m.decision) console.log("  decision.engine:", m.decision.engine, "· kind:", m.decision.kind, "· size:", m.decision.size, "· 키:", Object.keys(m.decision).join(","));
  for (const k of Object.keys(m)) if (!["steps", "decision", "placement"].includes(k)) console.log(`  ${k}:`, JSON.stringify(m[k]).slice(0, 200));
}
