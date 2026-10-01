/**
 * **떨어진 규칙을 넓힌 창에 다시 대 본다** (228회차 10-01, 사장님 "모두 다 해봐 실패를 알아야 성공하는거야").
 *
 *   npx tsx engine/tools/rookery_env.mts engine/tools/rule_revive.mts --one     # 한 개만 (값 재기)
 *   npx tsx engine/tools/rookery_env.mts engine/tools/rule_revive.mts --n 10
 *   npx tsx engine/tools/rookery_env.mts engine/tools/rule_revive.mts --all
 *   ... --write    ← 붙인다(없으면 재기만 하고 장부를 안 고친다)
 *
 * ## 왜 되살리나
 * 후보 66개 중 붙은 건 5개(8%)다. 떨어진 61개를 까닭별로 세어 보니:
 *   · **52건(85%)** — 어긴 사례가 0~2건이라 **잴 수가 없었다**
 *   ·   4건 — 어겼는데 실패로 안 이어졌다(진짜 쓸모없음)
 *   ·   5건 — 효과가 문턱을 못 넘었다(진짜 약함)
 * 붙은 5개는 전부 어긴 사례가 9~24건이었다. 즉 **자주 어기는 것만 배울 수 있었다.**
 *
 * 그런데 그 "어긴 사례 수" 는 **창 크기에 달려 있었다.** 사례를 160건만 보고 있었고(쌓인 것은 356건),
 * 보류분이 64건이라 드문 규칙은 1~2건밖에 안 잡혔다. 창을 400 으로 넓히면 보류분이 142건이다 —
 * 같은 빈도라도 어긴 사례가 2.2배로 잡힌다. **규칙이 나빠서 떨어진 게 아니었는지** 여기서 갈린다.
 *
 * ## 문턱은 안 건드린다
 * 3건을 2건으로 낮추면 오늘 당장 여러 개가 붙는다. 그런데 그러면 **우연이 규칙이 된다** —
 * 틀린 규칙은 이후 모든 일의 프롬프트에 들어가 조용히 망친다. 자는 그대로 두고 **증거만 늘린다.**
 *
 * 호출: 후보 하나당 1번(판정). 값은 돌릴 때마다 실제로 재서 찍는다.
 */
import { createServiceClient } from "../../src/lib/supabase/service";

const { collectCases } = await import("../../src/lib/genesis/cases");
const { isHoldout, decide, countsFrom } = await import("../../src/lib/genesis/ruleStats");
const { defaultProviders } = await import("../../src/lib/execution/shared");
const { meterProviders } = await import("../../src/lib/costs/meter");
const { z } = await import("zod");

const 인자 = process.argv.slice(2);
const 몇개 = 인자.includes("--all") ? 9999 : 인자.includes("--one") ? 1 : Number(인자[인자.indexOf("--n") + 1] ?? 5);
const 쓰나 = 인자.includes("--write");
const db = createServiceClient();

const { data: co } = await db.from("companies").select("id, name").eq("name", "권혁수").maybeSingle();
if (!co) { console.error("회사를 못 찾았다"); process.exit(1); }

// 사례는 **넓힌 창**으로. 모델을 안 붙인다(반응은 장부에 이미 있는 것을 쓴다) — 되살리기 값에 섞이면 안 된다.
const cases = await collectCases(db, (co as any).id, { limit: 400 });
const holdout = cases.filter((c: any) => isHoldout(c.id) && c.source !== "execution");
const 실패 = holdout.filter((c: any) => c.bad).length;
console.log(`사례 ${cases.length}건 · 보류분 **${holdout.length}건**(실패 ${실패} · 성공 ${holdout.length - 실패})`);
console.log(`(옛 창 160 일 때 보류분은 51~64건이었다)\n`);

const { data: cs } = await db.from("learning_candidates")
  .select("id, title, summary, reason, manager_note, created_at")
  .eq("status", "rejected").order("created_at", { ascending: false });

type 후보 = { id: string; title: string; summary: string; reason: string; manager_note: string; created_at: string };
const 떨어진 = ((cs ?? []) as 후보[]).flatMap((c) => {
  let r: { violation_test?: string; counts?: { a: number; b: number } } = {};
  try { r = JSON.parse(String(c.reason ?? "{}")); } catch { /* 옛 줄은 JSON 이 아니다 */ }
  if (!r.violation_test) return [];           // 어떻게 재는지 안 적힌 것은 다시 못 잰다
  const 옛어긴수 = (r.counts?.a ?? 0) + (r.counts?.b ?? 0);
  const 옛까닭 = String(c.manager_note ?? "");
  // **진짜로 약해서 떨어진 것은 안 되살린다.** 창을 넓혀도 lift 는 안 변할 이유가 없지만,
  // 되살릴 값은 "잴 수가 없었던 것" 에 먼저 쓴다 — 거기가 85% 다.
  const 잴수없었다 = 옛까닭.includes("판단 불가") || 옛까닭.includes("못 댔다") || 옛까닭.includes("어기고 실패한 사례");
  return [{ ...c, rule: c.summary || c.title, violationTest: r.violation_test, 옛어긴수, 옛까닭, 잴수없었다 }];
});
const 줄선것 = [...떨어진.filter((x) => x.잴수없었다), ...떨어진.filter((x) => !x.잴수없었다)].slice(0, 몇개);
console.log(`다시 잴 후보 ${줄선것.length}개 (다시 잴 수 있는 것 전부 ${떨어진.length}개${쓰나 ? " · **장부에 쓴다**" : " · 재기만 한다"})\n`);

// **장부에 적히게 한다.** 첫 판에서 호출 7번이 model_usage 에 한 줄도 안 남았다 —
// 도구가 `defaultProviders` 를 그냥 쓰면 계량기를 안 거친다. 값이 장부 밖으로 나가면
// 한도도 보고도 거짓이 된다(09-26 에 같은 구멍으로 거짓 보고가 나왔다).
// 사례는 사장님 회사 것을 읽지만 **값은 개발 계정이 낸다** — 이건 엔진 손보는 일이다.
const { data: devCo } = await db.from("companies").select("id").eq("name", "로키 개발").maybeSingle();
if (!devCo) { console.error("개발 회사를 못 찾았다 — 값을 어디에 달지 모른다"); process.exit(1); }
const { ai } = meterProviders(defaultProviders(null), db, { companyId: (devCo as any).id, purpose: "rule_revive" } as any);
const 꼴 = z.object({ judgments: z.array(z.object({ case: z.number(), violates: z.boolean() })) });
const 사례글 = (c: any, i: number) => [
  `### 사례 ${i}`, `부탁: ${c.task}`, `결과물: ${c.output}`,
].join("\n");
const JUDGE = [
  "각 사례가 규칙을 **어겼는지만** 판별한다. 좋은지 나쁜지는 묻지 않았다 — 결과가 좋았는지는 너에게 안 보여 준다.",
  "어겼으면 violates=true. 애매하면 false. 사례 번호를 빠뜨리지 마라.",
].join("\n");

let 붙을것 = 0, 그대로 = 0, 호출 = 0;
const 적을것: string[] = [];
for (const c of 줄선것) {
  let 결과: { counts: any; judged: number };
  try {
    const { output } = await ai.generateStructuredOutput({
      systemInstructions: JUDGE,
      input: [`규칙: ${c.rule}`, `어겼는지 판별하는 법: ${c.violationTest}`, "", ...holdout.map(사례글)].join("\n\n"),
      schema: 꼴, schemaName: "rule_judgments",
      maxTokens: Math.max(4000, holdout.length * 70), tier: "routine",
    });
    호출++;
    const v = new Map((output as any).judgments.map((j: any) => [j.case, j.violates]));
    const rows = holdout.flatMap((x: any, i: number) => (v.has(i) ? [{ bad: Boolean(x.bad), violates: Boolean(v.get(i)) }] : []));
    결과 = { counts: countsFrom(rows), judged: rows.length };
  } catch (e) { 호출++; console.log(`  건너뜀 — 판정 실패: ${e instanceof Error ? e.message : String(e)}`); continue; }

  const d = decide(결과.counts);
  const 새어긴수 = 결과.counts.a + 결과.counts.b;
  const 바뀜 = d.adopt ? "**붙는다**" : "그대로 떨어짐";
  if (d.adopt) 붙을것++; else 그대로++;
  console.log(`${바뀜}  어긴 사례 ${c.옛어긴수}→${새어긴수} · ${d.reason}`);
  console.log(`        ${String(c.title).slice(0, 72)}`);
  적을것.push(`| ${d.adopt ? "붙음" : "떨어짐"} | ${c.옛어긴수}→${새어긴수} | ${d.reason} | ${String(c.title).slice(0, 60)} |`);

  if (쓰나 && d.adopt) {
    const reason = (() => { try { return { ...JSON.parse(String(c.reason)), revive: { counts: 결과.counts, judged: 결과.judged, lift: d.lift, p: d.p, holdout: holdout.length } }; } catch { return { revive: true }; } })();
    await db.from("learning_candidates").update({
      status: "approved", decided_at: new Date().toISOString(), reason: JSON.stringify(reason),
      manager_note: `${c.옛까닭}\n되살림(보류 ${holdout.length}건, 옛 창에서는 ${c.옛어긴수}건): ${d.reason}`.trim(),
    }).eq("id", c.id);
  }
}

console.log(`\n────────────────────────────`);
console.log(`다시 잰 ${줄선것.length}개 → **붙는다 ${붙을것}개** · 그대로 ${그대로}개 · 호출 ${호출}번`);
if (!쓰나) console.log(`(재기만 했다. 장부에 쓰려면 --write)`);
if (적을것.length) console.log(`\n| 판정 | 어긴 사례 | 까닭 | 규칙 |\n|---|---|---|---|\n${적을것.join("\n")}`);
