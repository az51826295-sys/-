/**
 * **갇힌 조각을 꺼낸다** (226회차 2026-09-27).
 *
 * 조각 이어달리기는 결과가 대화에 붙는 순간에 돈다. 그 순간을 놓친 판(오늘 결과 붙이기가 고장나 있었다)은
 * `pendingPieces` 를 든 채로 멈춰 있다. 이 자는 그걸 손으로 한 칸 민다.
 *
 *   npx tsx engine/tools/rookery_env.mts engine/tools/mesh_next_piece.mts [--run]
 */
import { createServiceClient } from "../../src/lib/supabase/service";
import { dispatchOrder } from "../../src/lib/genesis/practice";

const RUN = process.argv.includes("--run");
const db = createServiceClient();
const { data } = await db.from("deliverables").select("id,title,company_id,content_json")
  .eq("deliverable_type", "mesh_assets").order("created_at", { ascending: false }).limit(10);
const stuck = ((data ?? []) as { id: string; title: string; company_id: string; content_json: Record<string, unknown> }[])
  .filter((r) => Array.isArray(r.content_json.pendingPieces) && (r.content_json.pendingPieces as unknown[]).length);
console.log(`갇힌 판 ${stuck.length}개`);
for (const r of stuck) {
  const p = r.content_json.pendingPieces as { 주문: string }[];
  console.log(`  ${r.id.slice(0, 8)} ${String(r.title).slice(0, 26)} — 남은 조각 ${p.length}: ${p.map((x) => x.주문.slice(0, 20)).join(" / ")}`);
}
if (!stuck.length || !RUN) { console.log(RUN ? "" : "\n--run 을 붙이면 맨 위 판의 다음 조각 하나를 낸다(30 크레딧 + 그림값)."); process.exit(0); }

const r = stuck[0];
const pend = r.content_json.pendingPieces as { 주문: string }[];
const { data: co } = await db.from("companies").select("owner_id").eq("id", r.company_id).maybeSingle();
const next = pend[0], rest = pend.slice(1);
const d = await dispatchOrder(db, r.company_id, "mesh_from_image", next.주문, (co?.owner_id as string) ?? "", rest.length ? { pendingPieces: rest } : undefined);
await db.from("deliverables").update({ content_json: { ...r.content_json, pendingPieces: null } }).eq("id", r.id);
console.log(`\n냈다: ${next.주문.slice(0, 50)} → ${d.employee} (${d.assignmentId.slice(0, 8)})`);
console.log(`남은 조각 ${rest.length}개`);
