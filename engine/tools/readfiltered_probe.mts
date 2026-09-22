/** 대기열이 쓰는 경로로 **1000줄 넘게** 심어 다 읽는지 본다. 모델 0, 돈 0. */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { readFiltered, PAGE } = await import("../../src/lib/db/readAll");
const db = createServiceClient();
let bad = 0, seen = 0;
const check = (n: string, ok: boolean, got?: unknown) => { seen++; if (!ok) bad++; console.log(ok ? "맞음  " : "어긋남", n, ok ? "" : JSON.stringify(got)); };
const CO = "00add05a-e81d-4e04-9980-34bb412a8780";
const { data: co } = await db.from("companies").select("owner_id").eq("id", CO).single();
const conv = (await db.from("conversations").insert({ owner_id: co!.owner_id, title: "자 시험 — 천 줄 넘기기" }).select("id").single()).data!.id as string;
const N = PAGE + 137;   // 1137줄 — 한 쪽으로는 절대 못 받는다
try {
  const t0 = Date.now();
  for (let i = 0; i < N; i += 500) {
    const rows = Array.from({ length: Math.min(500, N - i) }, (_, k) => ({
      conversation_id: conv, role: "user", content: "자 시험",
      created_at: new Date(t0 + (i + k) * 1000).toISOString(),
    }));
    const { error } = await db.from("conversation_messages").insert(rows);
    if (error) { console.error("심기 실패:", error.message); process.exit(2); }
  }
  const { count } = await db.from("conversation_messages").select("id", { count: "exact", head: true }).eq("conversation_id", conv);
  check(`**${N}줄이 진짜 들어갔다**`, count === N, { 심음: N, 있음: count });

  // 옛 방식: 한 번에 읽으면 잘린다
  const plain = (await db.from("conversation_messages").select("id").eq("conversation_id", conv)).data ?? [];
  check(`**옛 방식은 ${PAGE}줄에서 잘린다**`, plain.length === PAGE, plain.length);

  // 대기열이 쓰는 경로
  const all = await readFiltered<{ id: string }>(db, "conversation_messages", "id", (q) => q.eq("conversation_id", conv));
  check(`**대기열 경로는 ${N}줄을 다 읽는다**`, all.length === N, { 받음: all.length, 전체: N });
  check("받은 줄에 중복이 없다", new Set(all.map((r) => r.id)).size === N, new Set(all.map((r) => r.id)).size);
} finally {
  await db.from("conversation_messages").delete().eq("conversation_id", conv);
  await db.from("conversations").delete().eq("id", conv);
  console.log("치움");
}
console.log(`\n최종: ${bad ? `어긋남 ${bad}/${seen}` : `전부 맞음 ${seen}/${seen}`}`);
process.exit(bad ? 1 : 0);
