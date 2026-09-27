import { createServiceClient } from "../../src/lib/supabase/service";
const db = createServiceClient();
const { data } = await db.from("deliverables").select("id,title,created_at,content_json").eq("deliverable_type","mesh_assets").order("created_at",{ascending:false}).limit(3);
for (const r of (data ?? []) as { id: string; title: string; created_at: string; content_json: Record<string, unknown> }[]) {
  const p = r.content_json.pendingPieces as unknown[] | null;
  console.log(`${r.created_at.slice(11,19)} ${String(r.title).slice(0,30)}`);
  console.log(`   pendingPieces: ${p === undefined ? "**칸 자체가 없음**" : p === null ? "null" : `${p.length}개`}  · splitWhy: ${r.content_json.splitWhy ? "있음" : "없음"}`);
}
