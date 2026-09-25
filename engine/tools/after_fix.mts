const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
// ① 형식 고장: 고침 배포(09-24 16:02 UTC ≈ 0921043) 전 7일 vs 뒤
const fixAt = "2026-09-24T16:02:00Z";
for (const [label, from, to] of [["고침 전 7일", new Date(Date.parse(fixAt) - 7 * 864e5).toISOString(), fixAt], ["고침 뒤", fixAt, new Date().toISOString()]] as const) {
  const { data } = await db.from("work_executions").select("error_message, status").gte("created_at", from).lt("created_at", to);
  const rows = (data ?? []) as { error_message: string | null; status: string }[];
  const fmt = rows.filter((r) => /MODEL_OUTPUT_(OFF_SCHEMA|UNPARSEABLE|TRUNCATED)/.test(r.error_message ?? "")).length;
  console.log(`${label}: 실행 ${rows.length}건 중 형식 고장으로 죽음 ${fmt}건 (${rows.length ? ((fmt / rows.length) * 100).toFixed(1) : "-"}%)`);
}
// ② 영상 장면_계획_대비: 장면별 계획-실측 부호
const { data: vids } = await db.from("deliverables").select("id, created_at, content_json").eq("deliverable_type", "video").gte("created_at", new Date(Date.now() - 14 * 864e5).toISOString()).order("created_at", { ascending: false }).limit(30);
let longer = 0, shorter = 0, big = 0; const rows: string[] = [];
for (const d of (vids ?? []) as Record<string, any>[]) {
  const c = d.content_json ?? {}; const plan = (c.script?.scenes ?? []).map((s: any) => Number(s.seconds)); const real = (c.durations ?? []).map(Number);
  if (!plan.length || plan.length !== real.length) continue;
  const diffs = plan.map((p: number, i: number) => Math.round((real[i] - p) * 10) / 10);
  for (const x of diffs) { if (x > 0) longer++; else if (x < 0) shorter++; if (Math.abs(x) > 1) big++; }
  rows.push(`${String(d.created_at).slice(5, 16)} ${String(d.id).slice(0, 8)} 계획→실측 차이: ${diffs.join(", ")}`);
}
console.log(`장면별 차이(실측−계획): 길어짐 ${longer} · 짧아짐 ${shorter} · 1초 넘게 어긋남 ${big}`);
for (const r of rows.slice(0, 10)) console.log("  " + r);
