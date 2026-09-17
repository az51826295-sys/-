/** size_round 의 결과를 읽는다 — 계획 초·실측 초·쉼·주문 길이 자. 돈 0. */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const { data: a } = await db.from("assignments").select("id, status").eq("title", "로키 20초 설명 (크기 판단 시험)").order("created_at", { ascending: false }).limit(1).maybeSingle();
if (!a) { console.log("아직 업무가 없다"); process.exit(0); }
const aid = (a as { id: string }).id;
const { data: we } = await db.from("work_executions").select("status, current_step, error_message").eq("assignment_id", aid);
const w = ((we ?? []) as { status: string; current_step: string; error_message: string | null }[])[0];
console.log(`${(a as { status: string }).status} · ${w?.status}/${w?.current_step}${w?.error_message ? " · " + w.error_message : ""}`);
const { data: d } = await db.from("deliverables").select("content_markdown, content_json").eq("assignment_id", aid).limit(1).maybeSingle();
if (!d) process.exit(0);
const cj = (d as { content_markdown: string; content_json: { script?: { targetSec?: number; sizeWhy?: string; scenes?: { seconds?: number; footage?: string }[] }; durations?: number[]; total?: number; verdict?: { cases?: { name: string; result: string; message: string }[] } } }).content_json;
console.log(`목표 ${cj.script?.targetSec}s · 장면 ${cj.script?.scenes?.length}개 · 계획 ${cj.script?.scenes?.map((s) => s.seconds).join("+")} · 실측 ${cj.durations?.map((x) => x.toFixed(1)).join("+")} = ${cj.total?.toFixed(1)}s`);
console.log(`왜: ${cj.script?.sizeWhy}`);
console.log(`화면 산 장면: ${cj.script?.scenes?.filter((s) => (s.footage ?? "").trim()).length ?? 0}개`);
for (const c of cj.verdict?.cases ?? []) if (/길이|계획|첫장면/.test(c.name)) console.log(`  ${c.result === "Failed" ? "≠" : c.result === "Passed" ? "·" : "–"} ${c.name} — ${c.message}`);
const m = /크기: .*\n  왜: .*/.exec((d as { content_markdown: string }).content_markdown);
if (m) console.log("본문 줄: " + m[0].replace("\n", " / "));
