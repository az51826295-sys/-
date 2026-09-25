/**
 * **주문 채점** (219회차): order_gen 이 넣은 판들을 자·값·시간·상태로 세어 `engine/docs/genesis/data-collection.md` 에 한 줄씩 붙인다. 돈 0.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/order_score.mts <배치 json> [--wait]   (--wait: 다 끝날 때까지 30초마다 본다)
 */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { readFileSync, appendFileSync, existsSync } = await import("node:fs");
const db = createServiceClient();
const file = process.argv[2]; const WAIT = process.argv.includes("--wait");
const batch = JSON.parse(readFileSync(file, "utf8")) as { at: string; rows: { kind: string; ask: string; capabilityId: string | null; assignmentId: string | null }[] };
const NL = String.fromCharCode(10);
async function one(aid: string) {
  const { data: a } = await db.from("assignments").select("status, title").eq("id", aid).maybeSingle();
  const { data: ex } = await db.from("work_executions").select("id, status, error_message, created_at, updated_at").eq("assignment_id", aid).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const { data: d } = await db.from("deliverables").select("id, deliverable_type, content_json").eq("assignment_id", aid).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const { data: u } = await db.from("model_usage").select("cost_usd").eq("work_execution_id", ex?.id ?? "").limit(200);
  const usd = (u ?? []).reduce((x: number, r: any) => x + Number(r.cost_usd ?? 0), 0);
  const min = ex ? Math.round((new Date(ex.updated_at).getTime() - new Date(ex.created_at).getTime()) / 60000) : null;
  const cases = ((d?.content_json as any)?.verdict?.cases ?? []) as { result: string }[];
  const pass = cases.filter((c) => c.result === "Passed").length;
  const done = ["completed", "failed", "cancelled"].includes(ex?.status ?? "");
  return { done, status: ex?.status ?? a?.status ?? "?", err: ex?.error_message ?? "", type: d?.deliverable_type ?? "-", pass, total: cases.length, usd, min, title: a?.title ?? "" };
}
for (;;) {
  const rows = await Promise.all(batch.rows.map(async (r) => ({ r, s: r.assignmentId ? await one(r.assignmentId) : null })));
  const pending = rows.filter((x) => x.s && !x.s.done).length;
  if (!WAIT || pending === 0) {
    const out = ["", `### 배치 ${batch.at.slice(0, 16)} (손님 AI 주문 ${batch.rows.length}개)`, "| 종류 | 접수 | 상태 | 결과물 | 자 | 값 | 분 | 주문 첫 줄 |", "|---|---|---|---|---|---|---|---|"];
    for (const { r, s } of rows) out.push(`| ${r.kind} | ${r.capabilityId ?? "안 맡김"} | ${s ? s.status + (s.err ? " " + s.err.slice(0, 40) : "") : "(안 넣음)"} | ${s?.type ?? "-"} | ${s && s.total ? `${s.pass}/${s.total}` : "-"} | ${s ? "$" + s.usd.toFixed(3) : "-"} | ${s?.min ?? "-"} | ${r.ask.split(NL)[0].slice(0, 50)} |`);
    const md = "engine/docs/genesis/data-collection.md";
    if (!existsSync(md)) appendFileSync(md, "# 데이터 수집 — 손님 AI 가 쓴 주문을 진짜 접수로 넣고 자로 잰 기록 (09-25 시작)" + NL + "사장님: \"데이터 수집을 하게 니가 만들 수도 있는 거 아니야?\" — 주문은 손님 AI(luna)가, 접수·위임·일은 로키가, 셈은 자가." + NL);
    appendFileSync(md, out.join(NL) + NL);
    console.log(out.join(NL));
    console.log(`${NL}적음 → ${md}${pending ? ` (아직 도는 판 ${pending})` : ""}`);
    break;
  }
  console.log(`도는 판 ${pending} — 30초 뒤`); await new Promise((r) => setTimeout(r, 30_000));
}
