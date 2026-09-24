/** 이미 박은 원본에 부모의 기준·기대치를 물려준다(판 9 시도 4 뒤, 09-24). 파일은 안 건드린다. --id <원본> */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const id = process.argv[process.argv.indexOf("--id") + 1];
const { data: me } = await db.from("deliverables").select("id, parent_deliverable_id, content_json").eq("id", id).maybeSingle();
if (!me) { console.error("원본 없음"); process.exit(1); }
const c = (me.content_json ?? {}) as Record<string, unknown>;
const { data: pd } = await db.from("deliverables").select("content_json").eq("id", me.parent_deliverable_id as string).maybeSingle();
const pc = ((pd?.content_json ?? {}) as Record<string, unknown>);
const inherited = Object.fromEntries(["criteria", "coverage", "expectations", "target", "stage", "humanGate"].filter((k) => pc[k] != null && c[k] == null).map((k) => [k, pc[k]]));
const next: Record<string, unknown> = { ...inherited, ...c, origin: { ...(c.origin as object), inheritedFrom: me.parent_deliverable_id, inheritedAt: new Date().toISOString(), inheritedKeys: Object.keys(inherited) } };
const { error } = await db.from("deliverables").update({ content_json: next, updated_at: new Date().toISOString() }).eq("id", id);
if (error) { console.error("못 고침:", error.message); process.exit(1); }
console.log(`물려받음: ${Object.keys(inherited).join(",")} · 기준 ${Array.isArray(next.criteria) ? (next.criteria as unknown[]).length : 0}개 · 파일 ${(next.files as unknown[]).length}개 · target ${next.target}`);
