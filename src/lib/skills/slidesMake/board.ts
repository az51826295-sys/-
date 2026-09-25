import { z } from "zod";
import { ExecutionError, setStep } from "@/lib/execution/shared";
import { step } from "@/lib/execution/steps";
import { runWeb } from "@/lib/skills/appBuild/run";
import type { SkillRunContext } from "@/lib/skills/types";
import { checkAllowance } from "@/lib/costs/allowance";

/**
 * **로키가 자기 화면을 스스로 짠다** (221회차 09-25, 사장님 "로키 스스로 UI 구성해야 돼" → "되게 만들어라").
 *
 * 화면의 **재료**(지출·한도·직원·최근 판·수집 표·자 통과율)는 로키가 DB 에서 직접 읽는다 — 모델이 숫자를 지어낼 자리가 없다.
 * 화면의 **배치·이름·문구**는 로키(모델)가 정한다. 나오는 것은 한 파일 HTML — /ask 미리보기가 그대로 띄운다.
 * 자(모델 아님): 브라우저 오류 0 · 재료의 숫자가 화면에 다 보이나 · 칸 3개 이상 · 제목 있음. 예쁜가는 사람 칸.
 * 같은 주문을 다시 하면 그때의 숫자로 새 화면 — 즉 로키가 매번 자기 화면을 다시 짠다.
 */
const plan = z.object({
  title: z.string().describe("화면 제목. 짧게."),
  sections: z.array(z.object({
    heading: z.string().describe("칸 이름"),
    lines: z.array(z.string()).describe("이 칸에 보일 줄들. 아래 재료의 숫자·이름을 **그대로** 쓴다. 재료에 없는 숫자 금지."),
    tone: z.enum(["good", "warn", "plain"]).describe("칸 색: 좋음/주의/보통 — 재료의 사실로만 판단"),
  })).min(3).max(8),
  footer: z.string().describe("맨 아래 한 줄: 이 화면이 언제 어떤 사실로 짜였는지."),
});
type Plan = z.infer<typeof plan>;
type Case = { name: string; result: "Passed" | "Failed"; message: string };

/** 말이 현황판 주문으로 들리나 — 접수가 능력 id 를 못 줬을 때의 뒷문. */
export const isBoardAsk = (ask: string) => /현황판|대시보드|dashboard|(내|로키|네|니)\s*화면|지출.*(보이|볼 수)/i.test(ask);

export type BoardFacts = { spendMonthUsd: number; limitUsd: number | null; limitDays: number | null; employees: string[]; recent: { title: string; status: string; type: string; usd: number }[]; collected: { n: number; done: number; passRate: number | null }; probes: string };

/** 재료 — 모델 0. 전부 DB 에서. */
export async function gatherBoardFacts(ctx: SkillRunContext): Promise<BoardFacts> {
  const db = ctx.supabase; const CO = ctx.execution.company_id;
  // 지출은 문(checkAllowance)이 재는 숫자 그대로 — 최근 N일 창. 화면과 문이 다른 숫자를 말하면 안 된다.
  const a = await checkAllowance(db, CO);
  const spendMonthUsd = Math.round(a.spentUsd * 100) / 100;
  const co = a.limitUsd > 0 && !a.prepaid ? { spend_limit_usd: a.limitUsd, spend_window_days: a.windowDays } : null;
  const { data: ces } = await db.from("company_employees").select("employees(name)").eq("company_id", CO);
  const employees = ((ces ?? []) as unknown as { employees: { name: string } | { name: string }[] | null }[]).map((r) => (Array.isArray(r.employees) ? r.employees[0]?.name : r.employees?.name) ?? "").filter(Boolean);
  const { data: asg } = await db.from("assignments").select("id, title, status, role_input_json, created_at").eq("company_id", CO).order("created_at", { ascending: false }).limit(12);
  const recent: BoardFacts["recent"] = [];
  let cn = 0, cdone = 0, cpass = 0, ctotal = 0;
  for (const a of (asg ?? []) as Record<string, any>[]) {
    const { data: d } = await db.from("deliverables").select("deliverable_type, content_json, work_execution_id").eq("assignment_id", a.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const { data: u } = await db.from("model_usage").select("cost_usd").eq("work_execution_id", (d?.work_execution_id as string) ?? "").limit(200);
    const usd = Math.round(((u ?? []) as { cost_usd: number }[]).reduce((s, x) => s + Number(x.cost_usd ?? 0), 0) * 1000) / 1000;
    recent.push({ title: String(a.title).slice(0, 40), status: String(a.status), type: String(d?.deliverable_type ?? "-"), usd });
    if ((a.role_input_json as { collected?: boolean } | null)?.collected) {
      cn++; if (a.status === "completed" || a.status === "submitted") cdone++;
      const cases = ((d?.content_json as any)?.verdict?.cases ?? []) as { result: string }[];
      cpass += cases.filter((c) => c.result === "Passed").length; ctotal += cases.length;
    }
  }
  return { spendMonthUsd, limitUsd: co?.spend_limit_usd != null ? Number(co.spend_limit_usd) : null, limitDays: co?.spend_window_days != null ? Number(co.spend_window_days) : null, employees, recent: recent.slice(0, 10), collected: { n: cn, done: cdone, passRate: ctotal ? Math.round((cpass / ctotal) * 100) : null }, probes: "" };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export function renderBoard(p: Plan, f: BoardFacts): string {
  const tone = { good: "#1f8f5f", warn: "#c8772b", plain: "#5b6b7a" };
  const cards = p.sections.map((s) => `<section class="card" style="border-color:${tone[s.tone]}"><h2 style="color:${tone[s.tone]}">${esc(s.heading)}</h2><ul>${s.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul></section>`).join("\n");
  const rows = f.recent.map((r) => `<tr><td>${esc(r.title)}</td><td>${esc(r.type)}</td><td>${esc(r.status)}</td><td>$${r.usd.toFixed(3)}</td></tr>`).join("");
  return [
    `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(p.title)}</title>`,
    `<style>:root{--bg:#0f1720;--ink:#f3f6fa;--dim:#9fb0c0}body{margin:0;background:var(--bg);color:var(--ink);font-family:system-ui,-apple-system,"Segoe UI","Noto Sans KR",sans-serif;padding:24px}h1{font-size:22px;margin:0 0 16px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}.card{border:2px solid;border-radius:10px;padding:12px 14px;background:#141f2b}.card h2{font-size:14px;margin:0 0 8px}.card ul{margin:0;padding-left:18px;font-size:14px;line-height:1.6}table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px}td,th{border-bottom:1px solid #2a3a4a;padding:6px 8px;text-align:left}th{color:var(--dim);font-weight:600}.foot{color:var(--dim);font-size:12px;margin-top:14px}</style></head><body>`,
    `<h1>${esc(p.title)}</h1><div class="grid">${cards}</div>`,
    `<table><thead><tr><th>최근 일</th><th>종류</th><th>상태</th><th>값</th></tr></thead><tbody>${rows}</tbody></table>`,
    `<p class="foot">${esc(p.footer)} · 지출 $${f.spendMonthUsd}${f.limitUsd != null ? ` / 한도 $${f.limitUsd}/${f.limitDays}일` : ""} · 직원 ${f.employees.length}명 · 수집 ${f.collected.n}판</p>`,
    `<script>window.board={sections:${p.sections.length}};</script></body></html>`,
  ].join("\n");
}

/** 자 — 모델 0. 재료의 숫자가 화면 글자에 다 있나. */
export function judgeBoard(p: Plan, f: BoardFacts, html: string, facts: { ran: boolean; consoleErrors: string[]; text: string } | null): Case[] {
  const c: Case[] = [];
  c.push({ name: "칸_3개이상", result: p.sections.length >= 3 ? "Passed" : "Failed", message: `${p.sections.length}칸` });
  const must = [`$${f.spendMonthUsd}`, ...(f.limitUsd != null ? [`$${f.limitUsd}`] : []), `${f.employees.length}`];
  const missing = must.filter((m) => !html.includes(m));
  c.push({ name: "숫자_다_보임", result: missing.length ? "Failed" : "Passed", message: missing.length ? `빠진 숫자: ${missing.join(", ")}` : `지출·한도·직원 수 있음` });
  const alien = (p.sections.flatMap((s) => s.lines).join(" ").match(/\$\d+(?:\.\d+)?/g) ?? []).filter((n) => !html.includes(n) || ![`$${f.spendMonthUsd}`, `$${f.limitUsd}`, ...f.recent.map((r) => `$${r.usd.toFixed(3)}`), ...f.recent.map((r) => `$${r.usd}`)].some((k) => k === n));
  c.push({ name: "지어낸_달러_없음", result: alien.length ? "Failed" : "Passed", message: alien.length ? `재료에 없는 값: ${alien.slice(0, 4).join(", ")}` : "달러 숫자 모두 재료에서" });
  if (facts) c.push({ name: "브라우저_오류0", result: facts.ran && facts.consoleErrors.length === 0 ? "Passed" : "Failed", message: facts.ran ? `콘솔 오류 ${facts.consoleErrors.length}` : "열리지 않음" });
  else c.push({ name: "브라우저_오류0", result: "Failed", message: "헤드리스를 못 열어 못 잼" });
  return c;
}

export async function runBoard(ctx: SkillRunContext, ask: string) {
  await setStep(ctx.supabase, ctx.executionId, "planning");
  const f = await gatherBoardFacts(ctx);
  const NL = String.fromCharCode(10);
  const material = [
    `최근 ${f.limitDays ?? 30}일 지출 $${f.spendMonthUsd}${f.limitUsd != null ? ` · 한도 $${f.limitUsd}${f.spendMonthUsd >= f.limitUsd ? " (한도에 닿음 — 새 일 못 시작)" : ""}` : ""}`,
    `직원 ${f.employees.length}명: ${f.employees.join(", ")}`,
    `최근 일 ${f.recent.length}개: ${f.recent.map((r) => `${r.title}(${r.type}, ${r.status}, $${r.usd})`).join(" / ")}`,
    `데이터 수집 판 ${f.collected.n}개 중 끝남 ${f.collected.done}${f.collected.passRate != null ? ` · 자 통과율 ${f.collected.passRate}%` : ""}`,
  ].join(NL);
  const write = (failed: string[]) => ctx.providers.ai.generateStructuredOutput({
    systemInstructions: [
      "너는 로키(AI 회사)다. **네 화면(현황판)을 네가 짠다.** 아래 재료만으로 칸을 나누고 이름을 붙이고 줄을 쓴다.",
      "- 숫자·이름은 재료 그대로. 재료에 없는 숫자·약속을 쓰지 마라. 달러는 '$12.34' 꼴 그대로.",
      "- 칸 3~8개. 사장님(고3 학생 창업자)이 3초 안에 읽을 수 있게 — 한 칸에 한 가지.",
      "- tone: 한도에 가까우면 warn, 잘 되고 있으면 good, 나머지 plain.",
      failed.length ? `지난 판에서 자에 걸린 것(고쳐서 다시): ${failed.join(" / ")}` : "",
    ].filter(Boolean).join(NL),
    input: `주문: ${ask}${NL}${NL}## 재료(지금 DB 에서 읽은 것)${NL}${material}`,
    schema: plan, schemaName: "self_board", maxTokens: 16000, tier: "judgment",
  });
  let p = (await step(ctx.supabase, ctx.executionId, "board", async () => (await write([])).output)) as Plan;
  await setStep(ctx.supabase, ctx.executionId, "generating");
  let html = renderBoard(p, f);
  await setStep(ctx.supabase, ctx.executionId, "verifying");
  const look = async (h: string) => { try { const r = await runWeb([{ path: "index.html", language: "html", contents: h }], { mobile: false, actions: [{ do: "wait", ms: 400 }] }); return { ran: r.ran, consoleErrors: r.consoleErrors, text: r.text }; } catch { return null; } };
  let cases = judgeBoard(p, f, html, await look(html));
  if (cases.some((k) => k.result === "Failed")) {
    const failed = cases.filter((k) => k.result === "Failed").map((k) => `${k.name}: ${k.message}`);
    p = (await step(ctx.supabase, ctx.executionId, "board2", async () => (await write(failed)).output)) as Plan;
    html = renderBoard(p, f); cases = judgeBoard(p, f, html, await look(html));
  }
  const passed = cases.filter((k) => k.result === "Passed").length;
  const markdown = [`## ${p.title}`, "", "로키가 지금 DB 에서 읽은 사실로 **자기 화면을 스스로 짰어요.** 미리보기에서 그대로 열려요. 다시 시키면 그때 숫자로 새로 짭니다.", "",
    ...p.sections.map((s) => `- **${s.heading}** — ${s.lines.join(" · ")}`), "", `## 자 (${passed}/${cases.length})`, "| 자 | 결과 | 메모 |", "|---|---|---|",
    ...cases.map((k) => `| ${k.name} | ${k.result === "Passed" ? "✅" : "❌"} | ${k.message} |`), "", "보기 좋은가는 사장님 눈으로 — 마음에 안 드는 칸을 말하면 그 칸만 다시 짭니다."].join(NL);
  const content = { kind: "board", facts: f, plan: p, files: [{ path: "index.html", language: "html", contents: html }], target: "web", howToRun: "index.html 을 열면 된다.",
    verdict: { verdict: passed === cases.length ? "PASS" : passed * 2 >= cases.length ? "PARTIAL" : "FAIL", passed, failed: cases.length - passed, cases, scales: false, rate: Number((passed / cases.length).toFixed(4)) }, humanGate: ["보기 좋은가", "빠진 칸이 없는가"] };
  const { data: saved, error } = await ctx.supabase.rpc("submit_generated_deliverable", { p_execution_id: ctx.executionId, p_title: p.title, p_deliverable_type: "app_build", p_content_markdown: markdown, p_content_json: content, p_generation_model: ctx.providers.ai.model, p_citations: [] });
  if (error) throw new ExecutionError("DELIVERABLE_SAVE_FAILED", error.message);
  const rpc = saved as { ok: boolean; reason?: string; deliverableId?: string };
  if (!rpc.ok && !(rpc.reason === "already_submitted" && rpc.deliverableId)) throw new ExecutionError("DELIVERABLE_SAVE_FAILED", rpc.reason ?? "unknown");
  return { deliverableId: rpc.deliverableId as string, deliverableType: "app_build", metrics: { candidateCount: cases.length, selectedCount: passed, sections: p.sections.length } };
}
