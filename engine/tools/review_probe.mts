/**
 * 검토 대기열 자 — 고장을 심어 잡히는지. 모델 0, 돈 0.
 * **규칙이 바뀌어 자도 같이 고쳤다**(09-21): 이제 "아무 말"은 판정이 아니고,
 * 딱지(`attachments.reaction`)의 `accepted`/`rejected` 가 있어야 판정이다. 기계가 판정한 것은 안 센다.
 * 이건 측정 기준을 결과 보고 옮긴 게 아니라 **동작 명세가 바뀐 것**이다.
 */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { pendingReview, blockedByReviewQueue, REVIEW_SINCE } = await import("../../src/lib/genesis/reviewQueue");
const db = createServiceClient();
let bad = 0, seen = 0;
const check = (n: string, ok: boolean, got?: unknown) => { seen++; if (!ok) bad++; console.log(ok ? "맞음  " : "어긋남", n, ok ? "" : JSON.stringify(got)); };
const CO = "00add05a-e81d-4e04-9980-34bb412a8780", DEV = "e660c68b-5cdf-47ba-9673-5dded5cb8d83";
const { data: co } = await db.from("companies").select("owner_id").eq("id", CO).single();
if (!co) { console.error("데모 회사를 못 찾음"); process.exit(1); }
const base = await pendingReview(db, CO);
console.log(`심기 전 안 본 것 ${base.n}개 · AI가 판정으로 읽은 것 ${base.judged}개`);
const { data: conv } = await db.from("conversations").insert({ owner_id: co.owner_id, title: "자 시험 — 검토 대기열" }).select("id").single();
const C = conv!.id as string;
// 보관 선 뒤에 심는다 — 선 이전은 세지 않는 것이 설계다(사장님: 오늘 이전은 보관).
const t0 = Math.max(Date.now(), Date.parse(REVIEW_SINCE)) + 60_000;
const at = (ms: number) => new Date(t0 + ms).toISOString();
const made: string[] = [];
const work = async (title: string) => {
  const { data } = await db.from("assignments").insert({ company_id: CO, company_employee_id: DEV, title, description: "자 시험", status: "cancelled",
    role_input_json: { approved: true }, role_input_schema_id: "small_app_assignment_v1", priority: "normal" }).select("id").single();
  made.push(data!.id as string); return data!.id as string;
};
const post = (ms: number, aid: string, title: string) => db.from("conversation_messages").insert({ conversation_id: C, role: "assistant", content: "자 시험", created_at: at(ms), attachments: { assignment: { id: aid, title, queued: true } } });
const say = (ms: number, reaction?: { accepted: boolean; rejected: boolean }) => db.from("conversation_messages").insert({ conversation_id: C, role: "user", content: "자 시험", created_at: at(ms), attachments: reaction ? { reaction: { ...reaction, why: "자 시험", by: "ai", at: at(ms) } } : null });
try {
  const a1 = await work("안 본 것 1"), a2 = await work("잡담 뒤 1"), a3 = await work("딱지 붙은 것"), a4 = await work("기계가 판정한 것");
  // (가) 붙고 말이 없으면 안 본 것
  await post(1000, a1, "안 본 것 1");
  check("**붙고 말이 없으면 안 본 것**", (await pendingReview(db, CO)).n === base.n + 1, await pendingReview(db, CO));
  // (나) **그냥 말만 하면 판정이 아니다** — "밥 먹고 올게" 로 상한이 풀리면 안 된다
  await post(2000, a2, "잡담 뒤 1");
  await say(3000);
  check("**잡담은 판정이 아니다**", (await pendingReview(db, CO)).n === base.n + 2, await pendingReview(db, CO));
  // (다) 딱지에 accepted 가 있으면 판정
  await post(4000, a3, "딱지 붙은 것");
  await say(5000, { accepted: true, rejected: false });
  const r3 = await pendingReview(db, CO);
  check("**딱지(accepted)가 있으면 판정으로 센다**", r3.n === base.n + 2 && r3.judged === base.judged + 1, r3);
  // (라) 기계가 판정한 산출물은 상한에서 뺀다
  const { data: dl, error: dlErr } = await db.from("deliverables").insert({ company_id: CO, assignment_id: a4, title: "기계가 판정한 것", deliverable_type: "app_build", content_markdown: "자 시험", company_employee_id: DEV, deliverable_scope: "assignment", status: "submitted", version: 1,
    content_json: { loop: { rounds: [{ met: 3, unmet: 0, broken: 0 }] } } }).select("id").single();
  // 심은 것이 **진짜 들어갔는지** 먼저 본다 — 안 들어갔는데 "안 센다" 를 재면 자가 거짓말한다(09-21 아침의 실수).
  if (dlErr || !dl) { console.error("심은 산출물이 안 들어갔다 — 자가 못 잰다:", dlErr?.message); process.exit(2); }
  await post(6000, a4, "기계가 판정한 것");
  const r4 = await pendingReview(db, CO);
  check("**기계가 판정한 것은 사람 몫으로 안 센다**", r4.n === base.n + 2, r4);
  // (마) 문
  check("상한 위면 안 막는다", (await blockedByReviewQueue(db, CO, r4.n + 1)) === null);
  const why = await blockedByReviewQueue(db, CO, r4.n);
  check("**상한에 닿으면 막는다**", typeof why === "string" && /안 보신 결과물/.test(why), why);
} finally {
  // **치우는 것은 전부 여기서.** 시험 도중에 치우면 그 뒤 재는 값이 바뀐다(09-21에 당함).
  await db.from("deliverables").delete().in("assignment_id", made);
  await db.from("conversation_messages").delete().eq("conversation_id", C);
  await db.from("conversations").delete().eq("id", C);
  if (made.length) await db.from("assignments").delete().in("id", made);
  console.log("치움");
}
console.log(`\n최종: ${bad ? `어긋남 ${bad}/${seen}` : `전부 맞음 ${seen}/${seen}`}`);
process.exit(bad ? 1 : 0);
