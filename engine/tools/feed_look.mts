/** 읽기만 한다 — 무인 결과가 왜 안 붙었나. 아무것도 바꾸지 않는다. */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const { data: run } = await db.from("genesis_runs").select("result").eq("kind", "unattended").order("run_date", { ascending: false }).limit(1).maybeSingle();
const since = (run?.result as { startedAt: string }).startedAt;
const { data: asg } = await db.from("assignments").select("id").eq("role_input_json->>unattended", "true").limit(200);
const ids = (asg ?? []).map((a) => a.id as string);
const { data: dls } = await db.from("deliverables").select("id, title, created_at, content_json").in("assignment_id", ids).gte("created_at", since).order("created_at");
console.log(`판 시작 ${since} 이후 무인 산출물 ${dls?.length ?? 0}개`);
const { data: posted } = await db.from("conversation_messages").select("did:attachments->unattended->>deliverableId, created_at").not("attachments->unattended", "is", null).limit(500);
const done = new Set(((posted ?? []) as unknown as { did: string | null }[]).map((p) => p.did).filter(Boolean));
console.log(`붙은 표시 전체 ${posted?.length ?? 0}개`);
for (const d of dls ?? []) {
  const cj = d.content_json as Record<string, unknown> | null;
  console.log(`  ${done.has(d.id as string) ? "붙음" : "**안 붙음**"} ${d.title} · loop=${cj?.loop ? "있음" : "없음"} · askJudge=${cj?.askJudge ? "있음" : "없음"} · ${d.created_at}`);
}
const { data: conv } = await db.from("conversations").select("id, title, created_at").eq("title", "무인 판 결과").maybeSingle();
console.log(`결과 대화: ${conv ? `있음 ${conv.id.slice(0,8)} (${conv.created_at})` : "**없음 — 한 번도 안 만들어졌다**"}`);
