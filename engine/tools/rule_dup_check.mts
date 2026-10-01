/**
 * **이미 있는 말인가 — 뜻으로 묻는다** (228회차 10-01). 호출 1번(판단 자리).
 *
 *   npx tsx engine/tools/rookery_env.mts engine/tools/rule_dup_check.mts
 *   ... --write    ← 새것만 프롬프트에 올린다
 *
 * ## 왜 글자로는 모자랐나
 * `rule_promote.mts` 는 글자 3쪽 겹침 50% 로 중복을 걸러 3개를 뺐다. 그런데 남은 6개를 사람 눈으로 보니
 * *"입력·조작 판은 **실행 로그가 아니라** 실제 입력 순서와 화면·좌표 변화를 단계로 남긴다"* 와
 * *"입력·조작 판은 **실제 눌러 본 순서와 화면 변화**를 단계로 적는다"* 처럼 **같은 말인데 글자가 다른 쌍**이 있다.
 * 글자 겹침을 더 낮추면 이번엔 다른 규칙까지 같이 죽는다. **뜻은 뜻으로 재야 한다.**
 *
 * ## 상한이 진짜 벽인가
 * 10-01 측정: 지식 한 줄 ≈ 104 토큰, 6줄 더 = 모든 일마다 +622 토큰 ≈ 한 달 $0.11.
 * **돈은 벽이 아니다.** 벽은 같은 말이 여러 줄을 먹어 프롬프트가 묽어지는 것이다 —
 * 같은 지시가 네 번 적힌 프롬프트는 네 배로 지켜지지 않는다. 그래서 상한을 올리기 전에 중복부터 센다.
 */
import { createServiceClient } from "../../src/lib/supabase/service";
import { z } from "zod";

const { retrieveCompanyKnowledge } = await import("../../src/lib/knowledge/retrieval");
const { defaultProviders } = await import("../../src/lib/execution/shared");
const { meterProviders } = await import("../../src/lib/costs/meter");

const 쓰나 = process.argv.includes("--write");
const db = createServiceClient();
const { data: co } = await db.from("companies").select("id").eq("name", "권혁수").maybeSingle();
const { data: devCo } = await db.from("companies").select("id").eq("name", "로키 개발").maybeSingle();
if (!co || !devCo) { console.error("회사를 못 찾았다"); process.exit(1); }
const CO = (co as any).id;

const 실린것 = await retrieveCompanyKnowledge(db as any, CO);
const { data: 있는것 } = await db.from("organization_knowledge")
  .select("learning_candidate_id").eq("company_id", CO).eq("status", "active");
const 올라간 = new Set(((있는것 ?? []) as any[]).map((k) => k.learning_candidate_id).filter(Boolean));

const { data: cs } = await db.from("learning_candidates")
  .select("id, title, summary, reason").eq("company_id", CO).eq("status", "approved");
const 안올라간 = ((cs ?? []) as any[]).filter((c) => !올라간.has(c.id)).map((c) => {
  let lift = 0; try { const r = JSON.parse(String(c.reason ?? "{}")); lift = Number((r.revive ?? r).lift ?? 0); } catch { /* 옛 줄 */ }
  return { id: c.id, 글: c.summary || c.title, title: c.title, lift };
});
if (!안올라간.length) { console.log("안 올라간 붙은 규칙이 없다."); process.exit(0); }

console.log(`지금 실린 규칙 ${실린것.length}개 · 안 올라간 붙은 규칙 ${안올라간.length}개\n`);

const 꼴 = z.object({
  판정: z.array(z.object({
    번호: z.number(),
    이미있나: z.boolean().describe("실린 규칙 중 하나가 이것을 이미 시키고 있으면 true"),
    어느것: z.string().describe("이미있나=true 면 그 규칙의 첫머리. false 면 빈 글자."),
    새로시키는것: z.string().describe("이미있나=false 면 **실린 것이 안 시키는 무엇**을 한 줄로. true 면 빈 글자."),
  })),
});

const { ai } = meterProviders(defaultProviders(null), db, { companyId: (devCo as any).id, purpose: "rule_dup_check" } as any);
const { output } = await ai.generateStructuredOutput({
  systemInstructions: [
    "두 묶음의 **작업 규칙**이 있다. 아래 후보들이 이미 실린 규칙에 **뜻으로** 들어 있는지 가른다. 한국어로 답한다.",
    "",
    "- 글자가 달라도 **같은 행동을 시키면 이미 있는 것**이다. 말을 바꿔 적은 것은 새 규칙이 아니다.",
    "- 반대로, 한 글자만 달라도 **시키는 행동이 다르면 새것**이다(예: '적는다' vs '눌러 보고 적는다').",
    "- 애매하면 **이미 있는 쪽**으로 민다. 프롬프트에 같은 말이 두 번 실리면 둘 다 묽어진다.",
    "- 좋은 규칙인지는 묻지 않았다. **겹치는지만** 본다.",
  ].join("\n"),
  input: [
    "## 이미 실린 규칙",
    ...실린것.map((k: any, i: number) => `${i + 1}. ${k.title} — ${k.description}`),
    "",
    "## 가를 후보",
    ...안올라간.map((c, i) => `${i}. ${c.글}`),
  ].join("\n"),
  schema: 꼴, schemaName: "dup_check", maxTokens: 16000, tier: "judgment",
});

const 판정 = new Map((output as any).판정.map((j: any) => [j.번호, j]));
const 새것: typeof 안올라간 = [];
for (let i = 0; i < 안올라간.length; i++) {
  const j: any = 판정.get(i);
  const c = 안올라간[i];
  if (!j) { console.log(`?  판정이 안 왔다 — ${String(c.title).slice(0, 56)}`); continue; }
  if (j.이미있나) console.log(`이미 있음  ${String(c.title).slice(0, 56)}\n            ↑ ${String(j.어느것).slice(0, 70)}`);
  else { 새것.push(c); console.log(`**새것**   ${String(c.title).slice(0, 56)}\n            새로 시키는 것: ${String(j.새로시키는것).slice(0, 80)}`); }
}

console.log(`\n────────────────────────────`);
console.log(`안 올라간 ${안올라간.length}개 중 — 이미 있는 말 ${안올라간.length - 새것.length}개 · **진짜 새것 ${새것.length}개**`);
if (!새것.length) {
  console.log(`\n**상한을 올릴 까닭이 없다.** 자리가 모자란 게 아니라 **같은 말이 남아 있던 것**이다.`);
  console.log(`(장부에는 붙은 채로 둔다 — 떨어뜨리면 다음 판에 또 제안된다.)`);
  process.exit(0);
}
console.log(`한 줄 ≈ 104 토큰이므로 ${새것.length}줄 = 모든 일마다 +${새것.length * 104} 토큰.`);
if (!쓰나) { console.log(`\n(재기만 했다. 올리려면 --write)`); process.exit(0); }

for (const c of 새것) {
  const { error } = await db.from("organization_knowledge").insert({
    company_id: CO, title: `${String(c.title).slice(0, 100)} (검증된 규칙)`, description: c.글,
    category: "quality_improvement", status: "active", learning_candidate_id: c.id,
  });
  if (error) console.error(`  올리기 실패: ${error.message}`);
}
console.log(`\n**${새것.length}개 올렸다.**`);
