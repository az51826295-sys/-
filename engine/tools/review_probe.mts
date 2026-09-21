/** 검토 대기열 자 — 고장을 심어 잡히는지. 모델 0, 돈 0. */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { pendingReview, blockedByReviewQueue } = await import("../../src/lib/genesis/reviewQueue");
const db = createServiceClient();
let bad = 0, seen = 0;
const check = (n: string, ok: boolean, got?: unknown) => { seen++; if (!ok) bad++; console.log(ok ? "맞음  " : "어긋남", n, ok ? "" : JSON.stringify(got)); };
const CO = "00add05a-e81d-4e04-9980-34bb412a8780";
const { data: co } = await db.from("companies").select("owner_id").eq("id", CO).single();
if (!co) { console.error("데모 회사를 못 찾음"); process.exit(1); }
const base = await pendingReview(db, CO);
console.log(`심기 전 안 본 것 ${base.n}개`);
const { data: conv } = await db.from("conversations").insert({ owner_id: co.owner_id, title: "자 시험 — 검토 대기열" }).select("id").single();
const C = conv!.id as string;
const put = async (role: string, at: Date, did?: string, title?: string) =>
  db.from("conversation_messages").insert({ conversation_id: C, role, content: "자 시험", created_at: at.toISOString(),
    attachments: did ? { assignment: { id: did, title, queued: true } } : null });
try {
  const t0 = new Date(Date.now() - 60 * 60_000);
  // (가) 붙었는데 그 뒤 말 없음 → 안 본 것 2개
  await put("assistant", new Date(t0.getTime() + 1000), "did-aaa", "안 본 것 1");
  await put("assistant", new Date(t0.getTime() + 2000), "did-bbb", "안 본 것 2");
  const r1 = await pendingReview(db, CO);
  check("**붙고 말이 없으면 안 본 것**", r1.n === base.n + 2, { base: base.n, now: r1.n, titles: r1.titles.slice(0, 3) });
  // (나) 그 뒤에 사장님 말이 오면 판정이 일어난 것 → 0으로 돌아감
  await put("user", new Date(t0.getTime() + 3000));
  const r2 = await pendingReview(db, CO);
  check("**사장님이 말하면 판정된 것으로 친다**", r2.n === base.n, { now: r2.n, titles: r2.titles.slice(0, 3) });
  // (다) 말보다 **뒤에** 붙은 것은 다시 안 본 것
  await put("assistant", new Date(t0.getTime() + 4000), "did-ccc", "말 뒤에 붙음");
  const r3 = await pendingReview(db, CO);
  check("말 뒤에 붙은 것은 다시 안 본 것", r3.n === base.n + 1, r3.n);
  // (라) 문이 상한에서 닫히는가
  check("상한 위면 안 막는다", (await blockedByReviewQueue(db, CO, r3.n + 1)) === null);
  const why = await blockedByReviewQueue(db, CO, r3.n);
  check("**상한에 닿으면 막는다**", typeof why === "string" && /안 보신 결과물/.test(why), why);
} finally {
  await db.from("conversation_messages").delete().eq("conversation_id", C);
  await db.from("conversations").delete().eq("id", C);
  console.log("치움");
}
console.log(`\n최종: ${bad ? `어긋남 ${bad}/${seen}` : `전부 맞음 ${seen}/${seen}`}`);
process.exit(bad ? 1 : 0);
