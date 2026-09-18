// 179회차 고리 시험 — 데모 회사의 마지막 웹 게임 판을 놓고 "돌려 보기 → 심판 → 조각 고침" 을 N바퀴 돈다. 바퀴마다 맞음/오류/돈을 적는다.
//   npx tsx engine/tools/rookery_env.mts engine/tools/loop_probe.mts [--rounds 5] [--deliverable id]
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { defaultProviders } = await import("../../src/lib/execution/shared");
const { meterProviders } = await import("../../src/lib/costs/meter");
const { createOpenAIProvider } = await import("../../src/lib/providers/openai");
const { improveLoop } = await import("../../src/lib/skills/appBuild/loop");
const { factLines } = await import("../../src/lib/skills/appBuild/run");
const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const rounds = Number(arg("--rounds") ?? 5);
const db = createServiceClient();
const co = "00add05a-e81d-4e04-9980-34bb412a8780";
let q = db.from("deliverables").select("id, title, assignment_id, work_execution_id, company_employee_id, content_json, created_at").eq("company_id", co).eq("deliverable_type", "app_build").order("created_at", { ascending: false }).limit(1);
if (arg("--deliverable")) q = db.from("deliverables").select("id, title, assignment_id, work_execution_id, company_employee_id, content_json, created_at").eq("id", arg("--deliverable")!).limit(1);
const { data: rows } = await q;
const d = rows?.[0]; if (!d) throw new Error("산출물 없음");
const c = d.content_json as { files: { path: string; language: string; contents: string }[]; criteria: { id: string; when: string; then: string }[]; target?: string };
// --sabotage: 일부러 고장 낸다(09-14 규칙 "자는 고장을 재현해 잡아야 자다") — 점수가 안 오르게(score++ 를 지움), 타이머가 안 줄게.
if (process.argv.includes("--sabotage")) {
  const f = c.files.find((x) => /\.html?$/.test(x.path))!;
  const before = f.contents;
  f.contents = f.contents.replace(/score\s*\+\+|score\s*\+=\s*\d+/g, "score = score").replace(/(secondsLeft|timeLeft|remaining)\s*(--|-=\s*1)/g, "$1 -= 0");
  console.log(`고장 심음: ${before === f.contents ? "아무것도 안 바뀜(패턴이 안 맞음)" : "바뀜"}`);
}
console.log(`판: ${d.title} (${String(d.created_at).slice(0, 16)}) · 파일 ${c.files.length}개 · 기준 ${c.criteria.length}개 · ${c.target}`);
const { data: a } = await db.from("assignments").select("title, description").eq("id", d.assignment_id).single();
const scope = { companyId: co, workExecutionId: d.work_execution_id as string, companyEmployeeId: d.company_employee_id as string };
const judgeAi = meterProviders({ ...defaultProviders(), ai: createOpenAIProvider({ judgmentModel: process.env.LOOP_JUDGE_MODEL ?? "gpt-5.6-luna" }) }, db, scope).ai;
const fixAi = meterProviders({ ...defaultProviders(), ai: createOpenAIProvider({ judgmentModel: process.env.FIX_SEAT_MODEL ?? "gpt-5.6-luna" }) }, db, scope).ai;
const t0 = Date.now();
const r = await improveLoop({
  db, executionId: d.work_execution_id as string, judgeAi, fixAi,
  title: d.title as string, ask: `${a!.title}\n${a!.description ?? ""}`, criteria: c.criteria, files: c.files,
  mobile: false, rounds, usdCap: 1.0,
});
console.log(`\n멈춘 이유 ${r.stoppedBy} · 제일 좋은 판 ${r.bestRound}바퀴째 · ${Math.round((Date.now() - t0) / 1000)}초 · $${r.usd.toFixed(3)}`);
console.log("바퀴 | 맞음 | 안맞음 | 모름 | 고장 | 오류 | 고침 | 초 | $");
for (const x of r.rounds) console.log(`${x.n} | ${x.met}/${c.criteria.length} | ${x.unmet} | ${x.unknown} | ${x.broken} | ${x.errors} | ${x.edits} | ${Math.round(x.ms / 1000)} | ${x.usd}${x.best ? " ★" : ""}`);
for (const x of r.rounds) console.log(`  ${x.n}: ${x.toPerson}`);
if (r.facts) for (const l of factLines(r.facts)) console.log("  사실:", l);
const out = `C:/Users/az518/AppData/Local/Temp/claude/C--Users-az518-Desktop/f2c7198f-769b-44d1-a7c3-0ff62e8ac149/scratchpad/loop_best.html`;
const { writeFileSync } = await import("node:fs");
const html = r.files.find((f) => /\.html?$/.test(f.path)); if (html) writeFileSync(out, html.contents);
console.log("제일 좋은 판 저장:", out);
