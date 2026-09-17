/**
 * 지식이 일에 닿는가 (102회차 09-14). 돈 0.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/genesis_knowledge_probe.mts
 * 회사마다: 활성 지식 수, 상한에 들어가는 수, 검증된 규칙이 전부 들어가는가, 옛 상한(8·최신순)이면 무엇이 잘렸을까, 렌더 글자 수.
 */
const { retrieveCompanyKnowledge, renderCompanyKnowledge, rankKnowledge } = await import("../../src/lib/knowledge/retrieval");
const { MAX_KNOWLEDGE_PER_EXECUTION } = await import("../../src/lib/knowledge/types");
const { createServiceClient } = await import("../../src/lib/supabase/service");

let bad = 0;
const check = (name: string, ok: boolean, got?: unknown) => { if (!ok) bad++; console.log(ok ? "통과" : "실패", name, ok ? "" : JSON.stringify(got)); };

// 순서 규칙 자체
const ranked = rankKnowledge([
  { id: "fact-new", verified: false, category: "process_improvement", created_at: "2026-09-10" },
  { id: "rule-old", verified: false, category: "best_practice", created_at: "2026-08-01" },
  { id: "verified-old", verified: true, category: "quality_improvement", created_at: "2026-07-01" },
  { id: "fact-old", verified: false, category: "process_improvement", created_at: "2026-09-01" },
]).map((r) => r.id);
check("순서: 검증 → 규칙 → 사실(최신순)", ranked.join(",") === "verified-old,rule-old,fact-new,fact-old", ranked);

const db = createServiceClient();
const { data: cos } = await db.from("companies").select("id, name");
for (const co of (cos ?? []) as { id: string; name: string | null }[]) {
  const { data: all } = await db.from("organization_knowledge").select("id, title, category, created_at, learning_candidate_id").eq("company_id", co.id).eq("status", "active").order("created_at", { ascending: false });
  const rows = ((all ?? []) as { id: string; title: string; category: string; created_at: string; learning_candidate_id: string | null }[]);
  if (!rows.length) { console.log(`회사 ${co.name}: 활성 지식 0`); continue; }
  const items = await retrieveCompanyKnowledge(db, co.id);
  const text = renderCompanyKnowledge(items);
  const oldCut = rows.slice(0, 8); // 옛 상한: 최신순 8
  const dropped = rows.filter((r) => !oldCut.some((o) => o.id === r.id));
  const verified = rows.filter((r) => r.learning_candidate_id !== null);
  console.log(`회사 ${co.name}: 활성 ${rows.length} · 들어감 ${items.length}/${MAX_KNOWLEDGE_PER_EXECUTION} · 렌더 ${text.length}자 · 검증된 규칙 ${verified.length}`);
  for (const d of dropped) console.log(`   옛 상한(8)이면 잘렸을 것: ${d.title}`);
  check(`검증된 규칙이 전부 들어감(${(co.name ?? "").slice(0, 8)})`, verified.every((v) => items.some((i) => i.id === v.id)));
  check(`잘린 것 없음(${(co.name ?? "").slice(0, 8)})`, items.length === Math.min(rows.length, MAX_KNOWLEDGE_PER_EXECUTION), { items: items.length, rows: rows.length });
  const adopted = rows.find((r) => r.title.includes("(검증된 규칙)"));
  if (adopted) check("규칙 고리가 채택한 규칙이 프롬프트 글에 있음", text.includes(adopted.title));
}
console.log(bad ? `실패 ${bad}` : "전부 통과");
process.exitCode = bad ? 1 : 0;
