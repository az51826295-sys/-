/** 지금 안 본 결과물이 몇 개인가 — 회사별. 읽기만 한다. */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { pendingReview, REVIEW_CAP } = await import("../../src/lib/genesis/reviewQueue");
const db = createServiceClient();
const { data: cos } = await db.from("companies").select("id, name");
for (const c of cos ?? []) {
  const r = await pendingReview(db, c.id as string);
  if (!r.n) continue;
  console.log(`${String(c.name).padEnd(14)} 판정된 것 ${r.judged} · **안 본 것 ${r.n}**/${REVIEW_CAP}${r.n >= REVIEW_CAP ? "  막힘" : ""}`);
  console.log(`   ${r.titles.slice(0, 4).join(" · ")}${r.titles.length > 4 ? ` … 외 ${r.titles.length - 4}개` : ""}`);
  // 그중 **기계가 이미 판정한 것**이 몇이나 되나 — 사람 눈이 꼭 필요한 것과 가른다(사장님 09-20 제약 2).
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const { count: all } = await db.from("deliverables").select("id", { count: "exact", head: true }).eq("company_id", c.id as string).gte("created_at", since);
  const { count: mach } = await db.from("deliverables").select("id", { count: "exact", head: true }).eq("company_id", c.id as string).gte("created_at", since).or("content_json->>loop.not.is.null,content_json->>askJudge.not.is.null");
  console.log(`   30일 산출물 ${all}개 중 기계가 판정한 것 ${mach}개 · 사람 눈만이 아는 것 ${(all ?? 0) - (mach ?? 0)}개`);
}
