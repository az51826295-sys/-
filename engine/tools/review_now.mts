/** 지금 안 본 결과물이 몇 개인가 — 회사별. 읽기만 한다. */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { pendingReview, REVIEW_CAP } = await import("../../src/lib/genesis/reviewQueue");
const db = createServiceClient();
const { data: cos } = await db.from("companies").select("id, name");
for (const c of cos ?? []) {
  const r = await pendingReview(db, c.id as string);
  if (!r.n) continue;
  console.log(`${String(c.name).padEnd(14)} 안 본 것 ${String(r.n).padStart(3)}/${REVIEW_CAP}${r.n >= REVIEW_CAP ? "  **막힘**" : ""}`);
  console.log(`   ${r.titles.slice(0, 6).join(" · ")}${r.titles.length > 6 ? ` … 외 ${r.titles.length - 6}개` : ""}`);
}
