/**
 * **정규식과 AI 가 사장님 반응을 다르게 읽는 판** (156회차 09-16). 돈 0 (읽은 것은 사람 말에 붙어 있다).
 *   npx tsx engine/tools/rookery_env.mts engine/tools/reaction_probe.mts
 *
 * 사장님: "로키 판단자는 기계가 아니라 에이아이다. 2번부터."
 * 자를 하나 더 만드는 게 아니다 — **둘이 어긋난 판만 골라 사람이 읽게** 놓는다. 어느 쪽이 맞는지는 사장님이 안다.
 *
 * 첫 판(22:5x)은 `collectCases` 를 두 번 불러 견줬는데, 두 번째부터는 붙여 둔 AI 답을 양쪽이 다 읽어 **어긋남 0** 이 나왔다 —
 * 자가 자기 눈을 가린 것이다. 그래서 정규식은 여기서 **사람 말 원문에 직접** 댄다.
 */
const { CORRECTION } = await import("../../src/lib/genesis/reaction");
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const CO = "5925c03a-557f-46d7-8589-7388b769df40";
const { data: co } = await db.from("companies").select("owner_id").eq("id", CO).maybeSingle();
const { data: convs } = await db.from("conversations").select("id").eq("owner_id", (co as { owner_id: string }).owner_id).limit(200);
const ids = ((convs ?? []) as { id: string }[]).map((c) => c.id);
const { data: msgs } = await db.from("conversation_messages").select("id, content, attachments").in("conversation_id", ids).eq("role", "user").limit(2000);
type M = { id: string; content: string; attachments: { reaction?: { rejected: boolean; why: string; by: string } } | null };
const read = ((msgs ?? []) as M[]).filter((m) => m.attachments?.reaction?.by === "ai");
let same = 0; const diff: { regex: boolean; ai: boolean; said: string; why: string }[] = [];
for (const m of read) {
  const r = CORRECTION.test(m.content), a = m.attachments!.reaction!.rejected;
  if (r === a) same++; else diff.push({ regex: r, ai: a, said: m.content, why: m.attachments!.reaction!.why });
}
console.log(`AI 가 읽은 사람 말 ${read.length}건 · 같은 답 ${same} · **어긋남 ${diff.length}**`);
console.log(`  정규식 '물림' ${read.filter((m) => CORRECTION.test(m.content)).length}건 · AI '물림' ${read.filter((m) => m.attachments!.reaction!.rejected).length}건`);
console.log(`  정규식만 물림(AI 는 아님) ${diff.filter((d) => d.regex).length} · AI 만 물림(정규식은 못 봄) ${diff.filter((d) => d.ai).length}`);
for (const d of diff) {
  console.log(`\n${d.regex ? "정규식=물림 · AI=아님" : "정규식=못 봄 · AI=물림"}  「${d.said.slice(0, 90).replace(/\s+/g, " ")}」`);
  console.log(`   ${d.why.slice(0, 160)}`);
}
