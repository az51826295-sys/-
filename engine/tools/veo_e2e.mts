// 182회차: 서버(워커)에서 영상 직원이 Veo 로 장면을 실제로 사는가 — 데모 회사, 2장면 8초. 값 ≈ $0.5.
//   npx tsx engine/tools/rookery_env.mts engine/tools/veo_e2e.mts
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const co = "00add05a-e81d-4e04-9980-34bb412a8780";
type CE = { id: string; employees: { slug: string } | null };
const { data: emps } = await db.from("company_employees").select("id, employees(slug)").eq("company_id", co);
const vid = ((emps ?? []) as unknown as CE[]).find((e) => e.employees?.slug === "vid");
if (!vid) { console.error("데모 회사에 Vid 가 없다"); process.exit(1); }
const { data: busy } = await db.from("assignments").select("id, status").eq("company_employee_id", vid.id).in("status", ["assigned", "queued", "working", "submitted", "failed"]);
if ((busy ?? []).length) { console.log("Vid 살아 있는 업무:", JSON.stringify(busy)); process.exit(1); }
const TITLE = "[시험] 8초 영상 — 아침 산책";
const DESC = "8초짜리 아주 짧은 영상 하나. 장면은 **딱 두 개**만: (1) 공원 아침 햇살 아래 산책하는 사람 4초 (2) 벤치에 앉아 커피 마시는 손 4초. 각 장면에 실제 화면(footage)을 적는다. 내레이션은 한 문장씩 짧게.";
const { data: a, error } = await db.from("assignments").insert({ company_id: co, company_employee_id: vid.id, title: TITLE, description: DESC, status: "queued", role_input_json: { approved: true } }).select("id").single();
if (error) { console.error(error.message); process.exit(1); }
const aid = (a as { id: string }).id;
const { error: e2 } = await db.from("work_executions").insert({ company_id: co, assignment_id: aid, company_employee_id: vid.id, status: "queued", current_step: "context_loaded", attempt_number: 1 });
if (e2) { console.error(e2.message); process.exit(1); }
console.log(`업무 ${aid.slice(0, 8)} 넣음 — 워커가 집는다`);
const t0 = Date.now();
for (;;) {
  await new Promise((r) => setTimeout(r, 15_000));
  const { data: ex } = await db.from("work_executions").select("status, current_step, error_code").eq("assignment_id", aid).order("created_at", { ascending: false }).limit(1).single();
  if (["completed", "failed"].includes(ex!.status as string) || Date.now() - t0 > 12 * 60_000) { console.log("실행:", JSON.stringify(ex), `${Math.round((Date.now() - t0) / 1000)}초`); break; }
}
const { data: d } = await db.from("deliverables").select("content_json, content_markdown").eq("assignment_id", aid).maybeSingle();
const cj = d?.content_json as { workModel?: string; total?: number } | null;
console.log("산출물:", cj ? `길이 ${cj.total}초` : "없음");
console.log(((d?.content_markdown as string) ?? "").split("\n").filter((l) => /화면:|장면|초당|veo|sora|글자 카드/i.test(l)).slice(0, 6).join("\n"));
const { data: usage } = await db.from("model_usage").select("model, cost_usd, purpose").eq("work_execution_id", (await db.from("work_executions").select("id").eq("assignment_id", aid).limit(1).single()).data!.id);
const by: Record<string, number> = {}; for (const u of usage ?? []) by[u.model as string] = (by[u.model as string] ?? 0) + Number(u.cost_usd ?? 0);
console.log("장부:", Object.entries(by).map(([m, c]) => `${m} $${c.toFixed(3)}`).join(" · "));
