/** 넣은 2단계 판 중 기록이 안 남은 것 — 읽기만 한다. */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const CO = "00add05a-e81d-4e04-9980-34bb412a8780";
const { data: asg } = await db.from("assignments").select("id, title, status").eq("company_id", CO).not("role_input_json->>stage2", "is", null).order("created_at");
console.log(`2단계로 넣은 업무 ${asg?.length ?? 0}개`);
const t = new Map<string, number>();
for (const a of asg ?? []) t.set(String(a.status), (t.get(String(a.status)) ?? 0) + 1);
console.log(`상태: ${[...t].map(([k, v]) => `${k} ${v}`).join(" · ")}`);
const ids = (asg ?? []).map((a) => a.id as string);
const { data: dls } = await db.from("deliverables").select("assignment_id, seats:content_json->seats").in("assignment_id", ids);
const withMode = new Set((dls ?? []).filter((d) => (d.seats as { fixMode?: string } | null)?.fixMode).map((d) => d.assignment_id as string));
const noRec = (asg ?? []).filter((a) => !withMode.has(a.id as string));
console.log(`산출물 ${dls?.length ?? 0}개 · 자리 기록 있는 것 ${withMode.size}개 · **기록 없는 것 ${noRec.length}개**`);
for (const a of noRec) console.log(`  [${a.status}] ${String(a.title).slice(0, 34)}`);
const { data: fails } = await db.from("work_executions").select("error_code, error_message").eq("company_id", CO).eq("status", "failed").gte("created_at", new Date(Date.now() - 3 * 3600_000).toISOString());
if (fails?.length) { console.log(`\n실패한 실행 ${fails.length}개`); for (const f of fails.slice(0, 4)) console.log(`  ${f.error_code}: ${String(f.error_message ?? "").slice(0, 90)}`); }
