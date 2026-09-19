/**
 * 큰 파일(1,900줄 FPS)에서 조각 고침 자리별 시간·돈 (191회차 09-20). 사장님 "적은 돈·적은 시간·좋은 결과".
 * 09-19 밤 "아바타 추가" 판이 27분 걸렸다 — 고치는 자리(deepseek-v4-flash, 생각 모드)가 70KB 파일에 생각 토큰 3만 6천을 썼다.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/big_patch_probe.mts [--ask "…"]
 * 재료는 사장님 회사의 마지막 FPS 판을 DB 에서 읽는다(저장소에 안 넣는다). 값 ≈ 자리당 $0.02~0.06.
 */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { buildPatch } = await import("../../src/lib/skills/appBuild/patch");
const { createDeepSeekProvider } = await import("../../src/lib/providers/deepseek");
const { createOpenAIProvider } = await import("../../src/lib/providers/openai");
const { costOf } = await import("../../src/lib/costs/pricing");
import type { AIProvider } from "../../src/lib/providers/types";
const db = createServiceClient();
const ai = process.argv.indexOf("--ask");
const ask = ai > 0 ? process.argv[ai + 1] : "HUD 의 점수 글자를 지금보다 두 배 크게 해 줘.";
const { data } = await db.from("deliverables").select("title, content_json").eq("company_id", "5925c03a-557f-46d7-8589-7388b769df40").eq("deliverable_type", "app_build").ilike("title", "%FPS%").order("created_at", { ascending: false }).limit(1);
const cj = data![0].content_json as { files: { path: string; language: string; contents: string }[]; criteria: { id: string; when: string; then: string }[] };
const html = cj.files.find((f) => /\.html?$/.test(f.path))!;
console.log(`판: ${data![0].title} · ${html.path} · ${html.contents.split("\n").length}줄 · ${Math.round(html.contents.length / 1024)}KB · 부탁: ${ask}`);
const seats: [string, () => AIProvider][] = [
  ["gpt-5.6-luna", () => createOpenAIProvider({ judgmentModel: "gpt-5.6-luna" })],
  ["deepseek-v4-flash(생각 끔)", () => createDeepSeekProvider({ judgmentModel: "deepseek-v4-flash", thinking: false })],
  ["deepseek-v4-flash(생각 켬)", () => createDeepSeekProvider({ judgmentModel: "deepseek-v4-flash", thinking: true })],
];
console.log("자리 | 붙음 | 조각 | 바뀐 줄 | 초 | $ | 출력 토큰");
for (const [name, make] of seats) {
  const base = make(); let usd = 0, out = 0;
  const m = { ...base, async generateStructuredOutput(a: Parameters<typeof base.generateStructuredOutput>[0]) { const r = await base.generateStructuredOutput(a); usd += costOf({ backend: r.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens, cachedInputTokens: r.cachedInputTokens }); out += r.outputTokens; return r; } } as AIProvider;
  const t0 = Date.now();
  try {
    const p = await buildPatch(m, { title: data![0].title as string, ask, criteria: cj.criteria.slice(0, 8), failedChecks: [], full: [html], rest: [] });
    const sec = Math.round((Date.now() - t0) / 1000);
    console.log(`${name} | ${p.ok ? "예" : "아니오"} | ${p.ok ? p.patch.edits.length : "-"} | ${p.ok ? `${p.changedLines}/${p.totalLines}` : "-"} | ${sec} | ${usd.toFixed(4)} | ${out}`);
  } catch (e) { console.log(`${name} | 실패: ${e instanceof Error ? e.message.slice(0, 80) : e} | ${Math.round((Date.now() - t0) / 1000)}초`); }
}
