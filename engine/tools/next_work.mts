/**
 * **다음 일을 로키에게 묻는다** (217회차 09-25, 사장님 "다른 AI 와 대화하거나 해서 일 찾아서 계속해").
 * 내가 고르는 대신, 장부의 사실(최근 실패·자에 걸린 것·못 잼·주차장)을 로키(luna)에게 주고 **자가 있는 다음 일 셋**을 제안받는다.
 * 제안은 파일로 남기고, 사람이 읽을 수 있게 찍는다. 값 ≈ $0.02.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/next_work.mts [--days 7] [--out engine/work/anything/next-work.json]
 */
import { z } from "zod";
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { seatProvider } = await import("../../src/lib/skills/appBuild/seats");
const { readFileSync, writeFileSync, existsSync } = await import("node:fs");
const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const days = Number(arg("--days") ?? 7); const NL = String.fromCharCode(10);
const db = createServiceClient();
const since = new Date(Date.now() - days * 864e5).toISOString();

// 1) 실패한 실행 — 이유별로 센다
const { data: fails } = await db.from("work_executions").select("error_message, current_step, error_code").eq("status", "failed").neq("error_code", "WAITING_APPROVAL").gte("created_at", since).limit(300);   // 기다림은 실패가 아니다(types.ts:175 — 상태표가 잠겨 실패 칸을 빌림)
const failTally: Record<string, number> = {};
for (const f of (fails ?? []) as { error_message: string | null; current_step: string }[]) { const k = `${f.current_step} · ${String(f.error_message ?? "?").split(":")[0].slice(0, 60)}`; failTally[k] = (failTally[k] ?? 0) + 1; }
// 2) 결과물의 자 — 떨어진 자 이름별로 센다(모든 종류)
const { data: dels } = await db.from("deliverables").select("deliverable_type, content_json").gte("created_at", since).limit(500);
const ruleFail: Record<string, number> = {}; const typeCount: Record<string, number> = {};
for (const d of (dels ?? []) as { deliverable_type: string; content_json: Record<string, any> | null }[]) {
  typeCount[d.deliverable_type] = (typeCount[d.deliverable_type] ?? 0) + 1;
  for (const c of (d.content_json?.verdict?.cases ?? []) as { name: string; result: string }[]) if (c.result === "Failed") { const k = `${d.deliverable_type}:${c.name}`; ruleFail[k] = (ruleFail[k] ?? 0) + 1; }
}
// 3) 주차장·원장 꼬리
const parking = ["engine/docs/parking-lot.md", "engine/docs/genesis/parking-lot.md"].filter(existsSync).map((p) => readFileSync(p, "utf8").slice(-3000)).join(NL);
const ledger = existsSync("engine/docs/genesis/anything-runs.md") ? readFileSync("engine/docs/genesis/anything-runs.md", "utf8").slice(-6000) : "";

const facts = [
  `## 최근 ${days}일 실패한 실행(단계 · 이유: 건수)`, ...Object.entries(failTally).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => `- ${k}: ${v}`),
  "", "## 결과물 종류별 개수", ...Object.entries(typeCount).map(([k, v]) => `- ${k}: ${v}`),
  "", "## 결과물의 자 중 떨어진 것(종류:자 — 건수)", ...Object.entries(ruleFail).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([k, v]) => `- ${k}: ${v}`),
  "", "## 주차장(사람이 나중에 정할 것 — 여기 있는 건 네가 정하지 마라)", parking || "(없음)",
  "", "## 원장 꼬리(오늘 무슨 일이 있었나)", ledger,
].join(NL);

const schema = z.object({
  일: z.array(z.object({
    이름: z.string().describe("한 줄. 무엇을 고치거나 더하나."),
    근거: z.string().describe("위 사실 중 어느 줄이 근거인가 — 사실을 그대로 인용."),
    자: z.string().describe("이 일이 됐는지 **기계가 무엇을 얼마로 재서** 아는가. 자가 없으면 '자 없음' 이라고 적고 그 일은 뒤로."),
    사람손: z.boolean().describe("사장님 결정·결제·취향이 필요한 일이면 true(그러면 하지 않고 적어 둔다)."),
    값: z.string().describe("모델 값 어림. '0' 이면 코드만."),
  })).min(3).max(5),
  안한것: z.string().describe("일부러 안 고른 것과 왜."),
});
const ai = await seatProvider(arg("--seat") ?? "gpt-5.6-luna");   // 217회차: --seat 로 다른 AI(딥시크 포함)에게도 묻는다
if (!ai) { console.error("자리를 못 앉혔다"); process.exit(1); }
const { output } = await ai.generateStructuredOutput({
  systemInstructions: [
    "너는 로키(일하는 AI 회사)를 감독하는 AI 다. 아래는 최근 장부의 사실이다. **다음에 할 일 셋~다섯**을 고른다.",
    "규칙: 사실에 근거가 있는 것만. 자(기계가 재는 것)가 있는 일이 먼저. 사장님 결정·결제·취향이 드는 일은 고르되 사람손=true 로 표시.",
    "새 기능을 지어내지 말고 **실패·떨어진 자·못 잼**을 줄이는 일을 고른다. 주차장에 있는 건 사람 몫이니 고르지 마라.",
    "답은 JSON 하나.",
  ].join(NL),
  input: facts, schema, schemaName: "next_work", maxTokens: 16000, tier: "judgment",
});
const out = arg("--out") ?? "engine/work/anything/next-work.json";
writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), days, facts, output }, null, 2), "utf8");
console.log(`사실 ${facts.length}자 → 제안 ${output.일.length}개 (저장 ${out})${NL}`);
for (const [i, w] of output.일.entries()) console.log(`${i + 1}. ${w.이름}${w.사람손 ? "  [사람 손]" : ""}${NL}   근거: ${w.근거}${NL}   자: ${w.자}${NL}   값: ${w.값}`);
console.log(`${NL}안 한 것: ${output.안한것}`);
