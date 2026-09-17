/**
 * **사람이 누른 것이 사례가 되는가** (151회차 09-16). 돈 0, 모델 0.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/genesis_review_case_probe.mts
 *
 * 151회차에 잰 것: `deliverable_reviews` 가 사례 원천이 아니었다 — **사장님이 승인·수정 요청을 눌러도
 * 자가진화는 못 봤다.** 사람의 반응이 유일한 정답이라고 해 놓고 담는 통이 안 이어져 있었다.
 *
 * 진짜 판정이 0건이라 눈으로 확인할 자료가 없다. 그래서 **시험 회사의 판 하나에 판정을 넣었다 빼면서** 본다:
 *   ① 사람 판정이 사례로 들어오나  ② 기계가 '성공' 이라 한 판이 사람 때문에 **실패로 뒤집히나**
 *   ③ 같은 판이 사례 **둘로 세어지지 않나**(기계 것은 빠져야 한다)  ④ 지운 뒤 원래대로 돌아오나
 * 시험 회사(`시험판 v0`)에만 쓰고, 끝나면 반드시 지운다.
 */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { collectCases } = await import("../../src/lib/genesis/cases");
const db = createServiceClient();
const CO = "1cab5081-110a-405a-8521-5d4f277bc5af"; // 시험판 v0

let bad = 0;
const check = (name: string, ok: boolean, got?: unknown) => { if (!ok) bad++; console.log(ok ? "통과" : "실패", name, ok ? "" : JSON.stringify(got)); };

const before = await collectCases(db, CO, { limit: 400 });
const pass = before.find((c) => c.source === "verdict" && !c.bad);
if (!pass) { console.error("기계가 통과시킨 판이 없어 시험할 수 없다"); process.exit(1); }
const did = pass.id.slice(2);
console.log(`시험할 판 ${did.slice(0, 8)} — 기계 판정 성공, 사람 판정 없음`);

const { data: existing } = await db.from("deliverable_reviews").select("id").eq("deliverable_id", did);
if ((existing ?? []).length) { console.error("이미 판정이 있다 — 다른 판을 골라라"); process.exit(1); }

// reviewer_user_id 는 비울 수 없다 — 그 회사 주인으로 넣는다(시험 회사다).
const { data: own } = await db.from("companies").select("owner_id").eq("id", CO).maybeSingle();
const { data: ins, error } = await db.from("deliverable_reviews")
  .insert({ company_id: CO, deliverable_id: did, reviewer_user_id: (own as { owner_id: string }).owner_id, decision: "needs_changes", feedback: "시험: 투구 크기가 개판이다" })
  .select("id").single();
if (error) { console.error("판정 못 넣음:", error.message); process.exit(1); }
const rid = (ins as { id: string }).id;

try {
  const after = await collectCases(db, CO, { limit: 400 });
  const rc = after.find((c) => c.id === `r:${did}`);
  check("① 사람 판정이 사례로 들어온다", !!rc, after.filter((c) => c.source === "review").length);
  check("② 기계가 통과시킨 판이 사람 때문에 실패로 뒤집힌다", rc?.bad === true, rc?.bad);
  check("   이유가 사례에 붙는다", (rc?.note ?? "").includes("수정 요청"), rc?.note);
  check("③ 같은 판이 둘로 안 세어진다(기계 것은 빠짐)", !after.some((c) => c.id === `d:${did}`));
  check("   전체 개수는 그대로", after.length === before.length, { before: before.length, after: after.length });
} finally {
  await db.from("deliverable_reviews").delete().eq("id", rid);
}

const back = await collectCases(db, CO, { limit: 400 });
check("④ 판정을 지우면 원래대로", back.some((c) => c.id === `d:${did}`) && !back.some((c) => c.id === `r:${did}`));
const { data: left } = await db.from("deliverable_reviews").select("id").eq("deliverable_id", did);
check("   시험 판정이 남지 않았다", (left ?? []).length === 0);
console.log(bad ? `\n${bad}건 실패` : "\n전부 통과");
process.exit(bad ? 1 : 0);
