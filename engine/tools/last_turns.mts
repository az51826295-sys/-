/**
 * **방금 무슨 일이 있었나** (165회차 09-17). 읽기만 한다. 돈 0, 모델 0.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/last_turns.mts [시간=3]
 *
 * 사장님이 "방금 로키가 이상하게 했다" 고 하면 짐작하지 말고 이걸 돌린다: 최근 대화 턴(누가·무엇을·붙은 것),
 * 그 사이에 생긴 업무(누가·상태·지난 판을 이어받았나), 나온 산출물(종류·파일 수·판).
 */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const hours = Number(process.argv[2] ?? 3);
const since = new Date(Date.now() - hours * 3600_000).toISOString();
const cut = (s: unknown, n: number) => String(s ?? "").replace(/\s+/g, " ").slice(0, n);
const hm = (t: string) => new Date(t).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

const { data: msgs, error: e1 } = await db.from("conversation_messages")
  .select("conversation_id, role, content, attachments, created_at").gte("created_at", since).order("created_at", { ascending: true }).limit(200);
if (e1) console.log("턴을 못 읽음:", e1.message);
console.log(`== 대화 턴 (${hours}시간, ${msgs?.length ?? 0}개)`);
for (const m of msgs ?? []) {
  const a = (m.attachments ?? {}) as Record<string, unknown>;
  const tags = Object.keys(a).filter((k) => a[k] != null && !(Array.isArray(a[k]) && (a[k] as unknown[]).length === 0));
  console.log(`${hm(m.created_at as string)} [${String(m.conversation_id).slice(0, 8)}] ${m.role}: ${cut(m.content, 260)}${tags.length ? `  «${tags.join(",")}»` : ""}`);
  for (const k of ["assignment", "routedTo", "returned", "plan"]) if (a[k]) console.log(`           ${k}: ${cut(JSON.stringify(a[k]), 300)}`);
}

const { data: asg, error: e2 } = await db.from("assignments").select("*").gte("created_at", since).order("created_at", { ascending: true }).limit(50);
if (e2) console.log("업무를 못 읽음:", e2.message);
console.log(`\n== 업무 (${asg?.length ?? 0}개)`);
for (const a of (asg ?? []) as Record<string, unknown>[]) {
  console.log(`${hm(a.created_at as string)} ${String(a.id).slice(0, 8)} [${a.status}] ${cut(a.title, 80)}`);
  const keys = Object.keys(a).filter((k) => /previous|source|parent|base|revision|fix/i.test(k));
  for (const k of keys) console.log(`           ${k}: ${cut(JSON.stringify(a[k]), 200)}`);
  console.log(`           지시: ${cut(a.instructions ?? a.description ?? a.brief, 500)}`);
}

const { data: dels, error: e3 } = await db.from("deliverables").select("*").gte("created_at", since).order("created_at", { ascending: true }).limit(50);
if (e3) console.log("산출물을 못 읽음:", e3.message);
console.log(`\n== 산출물 (${dels?.length ?? 0}개)`);
for (const d of (dels ?? []) as Record<string, unknown>[]) {
  const content = d.content as Record<string, unknown> | null;
  const files = (content?.files ?? content?.changedFiles ?? null) as unknown[] | null;
  console.log(`${hm(d.created_at as string)} ${String(d.id).slice(0, 8)} [${d.deliverable_type}] v${d.version} 업무 ${String(d.assignment_id).slice(0, 8)} · ${cut(d.title, 70)} · 파일 ${Array.isArray(files) ? files.length : "?"}`);
  if (content) console.log(`           칸: ${Object.keys(content).join(", ")}`);
}
