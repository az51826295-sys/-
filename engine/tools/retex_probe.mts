/**
 * 3D 고치는 판 손시험(09-26). 지난 3D 산출물 중 **진짜 Meshy taskId** 가 남은 것을 찾아,
 * 다시 칠하기(retexture)가 실제로 도는지 잰다.
 *
 *   npx tsx engine/tools/rookery_env.mts engine/tools/retex_probe.mts            # 찾기만(돈 0)
 *   npx tsx engine/tools/rookery_env.mts engine/tools/retex_probe.mts --run      # 1 크레딧 쓴다
 */
import { createServiceClient } from "../../src/lib/supabase/service";
import { defaultMeshProvider } from "../../src/lib/providers/meshy";

const run = process.argv.includes("--run");
const db = createServiceClient();

const { data, error } = await db
  .from("deliverables")
  .select("id, title, created_at, content_json")
  .eq("deliverable_type", "mesh_assets")
  .order("created_at", { ascending: false })
  .limit(60);
if (error) throw new Error(error.message);

type Row = { id: string; title: string | null; created_at: string; content_json: unknown };
const rows = (data ?? []) as Row[];
const usable = rows.filter((r) => {
  const m = (r.content_json as { mesh?: { taskId?: string; mock?: boolean } } | null)?.mesh;
  return !!m?.taskId && !m.mock && !String(m.taskId).startsWith("mock-");
});

console.log(`3D 산출물 ${rows.length}개 중 다시 칠할 수 있는 것 ${usable.length}개`);
for (const r of usable.slice(0, 5)) {
  const m = (r.content_json as { mesh?: { taskId?: string } }).mesh!;
  console.log(`  ${r.created_at.slice(0, 16)}  ${String(r.title).slice(0, 30)}  task=${m.taskId}`);
}
if (!usable.length) { console.log("다시 칠할 대상이 없다 — 실제 Meshy 판이 DB 에 없다."); process.exit(0); }
if (!run) { console.log("\n--run 을 붙이면 맨 위 것을 1 크레딧으로 다시 칠해 본다."); process.exit(0); }

const target = usable[0];
const taskId = (target.content_json as { mesh?: { taskId?: string } }).mesh!.taskId!;
const mesher = defaultMeshProvider();
console.log(`\n다시 칠하기 시작: ${taskId}  (${mesher.name})`);
const t0 = Date.now();
try {
  const r = await mesher.retexture(taskId, "dark weathered steel, matte finish, soot stains");
  console.log(`끝남 ${((Date.now() - t0) / 1000).toFixed(0)}초 · 크레딧 ${r.consumedCredits} · glb ${r.glbUrl ? "있음" : "없음"} · fbx ${r.fbxUrl ? "있음" : "없음"}`);
  console.log(`새 taskId: ${r.taskId}`);
} catch (e) {
  console.log(`떨어짐 ${((Date.now() - t0) / 1000).toFixed(0)}초: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
}
