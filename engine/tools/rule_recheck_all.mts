/**
 * **지금 실린 규칙을 넓힌 창에 다시 대 본다** (228회차 10-02).
 *
 *   npx tsx engine/tools/rookery_env.mts engine/tools/rule_recheck_all.mts
 *   ... --write    ← 못 넘는 것을 내린다(deprecated)
 *
 * ## 왜
 * **채택은 그날 보류분에 대한 판정일 뿐이다.** 10-01 에 창을 160→400 으로 넓혀 보류분이 64→126건이 됐다.
 * 옛 창에서 붙은 규칙 5개는 **64건짜리 판정**으로 프롬프트에 올라가 있다. 넓은 자료에서도 서는지 안 봤다.
 *
 * 그리고 더 중요한 것: **어긴 사례가 0건인 규칙은 있으나 없으나 같다.** 아무도 안 어기는 줄이
 * 자리를 먹으면 그만큼 다른 규칙이 못 들어간다. 09-16 에 "규칙 18개 중 11개가 어긴 사례 0건" 을
 * 보고도 안 내렸다 — 그때는 내릴 근거(넓은 보류분)가 없었다. 지금은 있다.
 *
 * ## 내리는 것이 지는 것이 아니다
 * 규칙을 내리면 채택률 숫자가 깎인다. 그래도 내린다 — 프롬프트는 **지켜지는 줄**로 차 있어야지
 * **붙은 적 있는 줄**로 차 있으면 안 된다. 같은 자리에 센 규칙이 들어갈 수 있다.
 *
 * 호출: 규칙 하나당 1번. 값은 돌릴 때마다 실제로 재서 찍는다.
 */
import { createServiceClient } from "../../src/lib/supabase/service";
import { z } from "zod";

const { collectCases } = await import("../../src/lib/genesis/cases");
const { isHoldout, decide, countsFrom } = await import("../../src/lib/genesis/ruleStats");
const { defaultProviders } = await import("../../src/lib/execution/shared");
const { meterProviders } = await import("../../src/lib/costs/meter");

const 쓰나 = process.argv.includes("--write");
const db = createServiceClient();
const { data: co } = await db.from("companies").select("id").eq("name", "권혁수").maybeSingle();
const { data: devCo } = await db.from("companies").select("id").eq("name", "로키 개발").maybeSingle();
if (!co || !devCo) { console.error("회사를 못 찾았다"); process.exit(1); }
const CO = (co as any).id;

const cases = await collectCases(db, CO, { limit: 400 });
const holdout = cases.filter((c: any) => isHoldout(c.id) && c.source !== "execution");
console.log(`보류분 ${holdout.length}건(실패 ${holdout.filter((c: any) => c.bad).length})\n`);

const { data: ks } = await db.from("organization_knowledge")
  .select("id, title, description, learning_candidate_id").eq("company_id", CO).eq("status", "active");
const 규칙들 = ((ks ?? []) as any[]).filter((k) => k.learning_candidate_id);
console.log(`지금 실린 검증된 규칙 ${규칙들.length}개를 다시 잰다\n`);

// 어떻게 재는지(violation_test)는 후보 줄에 적혀 있다 — 없으면 다시 못 잰다.
const { data: cands } = await db.from("learning_candidates").select("id, reason").eq("company_id", CO);
const 재는법 = new Map<string, string>();
for (const c of (cands ?? []) as any[]) {
  try { const r = JSON.parse(String(c.reason ?? "{}")); if (r.violation_test) 재는법.set(c.id, r.violation_test); } catch { /* 옛 줄 */ }
}

const { ai } = meterProviders(defaultProviders(null), db, { companyId: (devCo as any).id, purpose: "rule_recheck" } as any);
const 꼴 = z.object({ judgments: z.array(z.object({ case: z.number(), violates: z.boolean() })) });
const JUDGE = [
  "각 사례가 규칙을 **어겼는지만** 판별한다. 좋은지 나쁜지는 묻지 않았다 — 결과가 좋았는지는 너에게 안 보여 준다.",
  "어겼으면 violates=true. 애매하면 false. 사례 번호를 빠뜨리지 마라.",
].join("\n");
const 사례글 = (c: any, i: number) => [`### 사례 ${i}`, `부탁: ${c.task}`, `결과물: ${c.output}`].join("\n");

let 남길것 = 0, 내릴것 = 0, 못잼 = 0, 호출 = 0;
const 줄: string[] = [];
for (const k of 규칙들) {
  const test = 재는법.get(k.learning_candidate_id);
  if (!test) { 못잼++; console.log(`못 잼     재는 법이 안 적혀 있다 — ${String(k.title).slice(0, 56)}`); continue; }
  let r: { counts: any; judged: number };
  try {
    // **쪼개 묻는다** — 10-02 측정: 126건을 한 번에 물으면 같은 규칙이 떨어졌다 붙었다 했다.
    const rows: { bad: boolean; violates: boolean }[] = [];
    for (let s = 0; s < holdout.length; s += 42) {
      const 쪽 = holdout.slice(s, s + 42);
      const { output } = await ai.generateStructuredOutput({
        systemInstructions: JUDGE,
        input: [`규칙: ${k.description}`, `어겼는지 판별하는 법: ${test}`, "", ...쪽.map(사례글)].join("\n\n"),
        schema: 꼴, schemaName: "rule_judgments", maxTokens: Math.max(4000, 쪽.length * 70), tier: "routine", temperature: 0,
      });
      호출++;
      const v = new Map((output as any).judgments.map((j: any) => [j.case, j.violates]));
      쪽.forEach((x: any, i: number) => { if (v.has(i)) rows.push({ bad: Boolean(x.bad), violates: Boolean(v.get(i)) }); });
    }
    r = { counts: countsFrom(rows), judged: rows.length };
  } catch (e) { 호출++; 못잼++; console.log(`못 잼     판정 실패: ${e instanceof Error ? e.message : String(e)}`); continue; }

  const d = decide(r.counts);
  const 어긴수 = r.counts.a + r.counts.b;
  if (d.adopt) { 남길것++; console.log(`남긴다    어긴 사례 ${String(어긴수).padStart(3)} · ${d.reason}\n          ${String(k.title).slice(0, 62)}`); }
  else { 내릴것++; console.log(`**내린다**  어긴 사례 ${String(어긴수).padStart(3)} · ${d.reason}\n          ${String(k.title).slice(0, 62)}`); }
  줄.push(`| ${d.adopt ? "남김" : "내림"} | ${어긴수} | ${d.reason} | ${String(k.title).slice(0, 56)} |`);

  if (쓰나 && !d.adopt) {
    await db.from("organization_knowledge").update({ status: "deprecated" }).eq("id", k.id);
    const { data: c } = await db.from("learning_candidates").select("manager_note").eq("id", k.learning_candidate_id).maybeSingle();
    await db.from("learning_candidates").update({
      manager_note: `${(c as any)?.manager_note ?? ""}\n넓은 보류분(${holdout.length}건) 재검증: ${d.reason} → 내림`.trim(),
    }).eq("id", k.learning_candidate_id);
  }
}

console.log(`\n────────────────────────────`);
console.log(`다시 잰 ${규칙들.length}개 → 남긴다 ${남길것} · **내린다 ${내릴것}** · 못 잼 ${못잼} · 호출 ${호출}번`);
if (!쓰나) console.log(`(재기만 했다. 내리려면 --write)`);
if (줄.length) console.log(`\n| 판정 | 어긴 사례 | 까닭 | 규칙 |\n|---|---|---|---|\n${줄.join("\n")}`);
