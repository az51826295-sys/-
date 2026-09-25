/** 실행 행이 남긴 것 전부(원문 출력·계획·메트릭). 계획 단계 고장 진단용. */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
for (const id of process.argv.slice(2).filter((a) => /^[0-9a-f]{8}/.test(a))) {
  const { data } = await db.from("work_executions").select("*").ilike("id", `${id}%`).maybeSingle();
  if (!data) { console.log(id, "없음"); continue; }
  const r = data as Record<string, unknown>;
  console.log(`--- ${String(r.id).slice(0, 8)} · ${r.status} · ${r.current_step}`);
  for (const k of Object.keys(r)) {
    const v = r[k]; if (v == null || ["id","company_id","assignment_id","company_employee_id","created_at","updated_at"].includes(k)) continue;
    const s = typeof v === "string" ? v : JSON.stringify(v);
    if (s.length > 20) console.log(`  ${k}: ${s.slice(0, 700)}${s.length > 700 ? " …" : ""}`);
  }
}
// 원장: 이 두 실행의 모델 호출 (계획 단계가 무엇을 불렀나)
const { data: mu } = await db.from("model_usage").select("model, purpose, input_tokens, output_tokens, created_at").gte("created_at", "2026-09-24T00:50:00Z").order("created_at").limit(20);
console.log("\n원장(00:50 이후):"); for (const m of mu ?? []) console.log(`  ${String(m.created_at).slice(11,19)} ${m.model} · ${m.purpose} · in ${m.input_tokens} out ${m.output_tokens}`);
