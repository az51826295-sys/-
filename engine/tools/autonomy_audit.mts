/**
 * **"사람 없이도 도는가" 점검** (201회차 09-21). 사장님: *"한 자리만 막지 말고, 대화에 안 붙은 일이 또 어디서 사람 손을 기다리는지 훑어보는 게 좋겠어요."*
 *
 * 09-20 6시간 무인 판이 과제 8개 중 1개만 하고 멈춘 원인: 결과를 풀어 주는 `releaseEmployee` 가
 * **`collectWorkReturns` 하나를 통해서만** 불리고, 그것이 닿는 범위가 좁았다.
 *
 * 이 자는 **의견이 아니라 지금 막혀 있는 일의 수**를 센다. 돈 0, 모델 0.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/autonomy_audit.mts
 */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const LIVE = ["assigned", "queued", "working", "waiting", "submitted", "failed", "needs_changes", "revision_queued", "revising"];
const hm = (t: string) => new Date(t).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

// 워커 returnsTick 이 실제로 닿는 대화(같은 질의를 그대로 흉내 낸다)
const since = new Date(Date.now() - 24 * 3600_000).toISOString();
const { data: rows } = await db.from("conversation_messages").select("conversation_id")
  .not("attachments->assignment->>id", "is", null).gte("created_at", since)
  .order("created_at", { ascending: false }).limit(200);
const reach = new Set([...new Set((rows ?? []).map((r) => r.conversation_id as string))].slice(0, 20));
console.log(`워커가 1분마다 닿는 대화: ${reach.size}개 (최근 24시간 · 메시지 200개 · 대화 20개 상한)\n`);

const { data: live } = await db.from("assignments").select("id, title, status, created_at, company_id, company_employee_id").in("status", LIVE).order("created_at");
console.log(`지금 살아 있는 업무 ${live?.length ?? 0}개:`);
const stuck: { why: string; a: { id: string; title: string; status: string; created_at: string } }[] = [];
for (const a of live ?? []) {
  const { data: m } = await db.from("conversation_messages").select("conversation_id, created_at")
    .contains("attachments", { assignment: { id: a.id } }).order("created_at", { ascending: false }).limit(1).maybeSingle();
  let why: string | null = null;
  if (!m) why = "대화에 안 붙음 — 영영 안 풀린다";
  else if (!reach.has(m.conversation_id as string)) {
    const age = Math.round((Date.now() - Date.parse(m.created_at as string)) / 3600_000);
    why = age > 24 ? `대화가 ${age}시간 전 것 — 24시간 창 밖` : "대화가 상한(200/20) 밖으로 밀림";
  }
  const mark = why ? "막힘" : "닿음";
  console.log(`  ${mark} [${String(a.status).padEnd(9)}] ${String(a.title).slice(0, 26).padEnd(28)} ${hm(a.created_at)}${why ? `  ← ${why}` : ""}`);
  if (why) stuck.push({ why, a: a as never });
}
console.log(`\n**사람이 안 보면 영영 안 풀리는 업무: ${stuck.length}개**`);
const byWhy: Record<string, number> = {};
for (const s of stuck) byWhy[s.why] = (byWhy[s.why] ?? 0) + 1;
for (const [w, n] of Object.entries(byWhy)) console.log(`  ${n}개 — ${w}`);

// 묶여 있는 직원
const { data: emps } = await db.from("company_employees").select("id, work_status, current_assignment_id, employees(name), company_id").neq("work_status", "ready");
console.log(`\n지금 묶여 있는 직원 ${emps?.length ?? 0}명:`);
for (const e of emps ?? []) console.log(`  ${((e as never as { employees?: { name?: string } }).employees?.name ?? "?").padEnd(6)} ${e.work_status} · 회사 ${String(e.company_id).slice(0, 8)}`);
