/**
 * **붙은 규칙을 실제로 프롬프트에 올린다** (228회차 10-01). 모델 0 · 값 0.
 *
 *   npx tsx engine/tools/rookery_env.mts engine/tools/rule_promote.mts         # 재기만
 *   npx tsx engine/tools/rookery_env.mts engine/tools/rule_promote.mts --write
 *
 * ## 왜 따로 있나
 * `rule_revive.mts` 는 장부의 딱지(`learning_candidates.status`)만 approved 로 바꿨다.
 * 그런데 **일하는 프롬프트가 읽는 것은 `organization_knowledge`** 다 — 거기 안 들어가면
 * 채택률 숫자만 오르고 **아무것도 안 달라진다.** 10-01 에 20개를 되살리고 나서야 이 틈을 봤다.
 *
 * ## 상한이 있다 — 그래서 센 것부터
 * 프롬프트는 지식을 **16개까지만** 싣는다(`MAX_KNOWLEDGE_PER_EXECUTION`). 검증된 규칙이 먼저 오고,
 * 그다음은 **새것 순**이다. 되살린 20개를 다 넣으면 오늘 만든 줄이 **원래 있던 센 규칙을 밀어낸다** —
 * lift 0.64 짜리가 lift 0.21 짜리에게 자리를 내주는 것이다. 그건 강화가 아니라 퇴보다.
 * 그래서 **lift 가 센 것부터 상한까지만** 올리고, 남은 것은 올리지 않은 채로 둔다(장부엔 남는다).
 */
import { createServiceClient } from "../../src/lib/supabase/service";
const { MAX_KNOWLEDGE_PER_EXECUTION } = await import("../../src/lib/knowledge/types");

const 쓰나 = process.argv.includes("--write");
const db = createServiceClient();
const { data: co } = await db.from("companies").select("id, name").eq("name", "권혁수").maybeSingle();
if (!co) { console.error("회사를 못 찾았다"); process.exit(1); }
const CO = (co as any).id;

const { data: 이미 } = await db.from("organization_knowledge")
  .select("id, title, learning_candidate_id").eq("company_id", CO).eq("status", "active");
const 올라간것 = new Set(((이미 ?? []) as any[]).map((k) => k.learning_candidate_id).filter(Boolean));
const 검증된것 = ((이미 ?? []) as any[]).filter((k) => k.learning_candidate_id).length;
console.log(`지금 프롬프트에 올라간 지식 ${(이미 ?? []).length}개 (그중 검증된 규칙 ${검증된것}개) · 상한 ${MAX_KNOWLEDGE_PER_EXECUTION}`);

const { data: cs } = await db.from("learning_candidates")
  .select("id, title, summary, reason, manager_note").eq("company_id", CO).eq("status", "approved");
type 후보 = { id: string; title: string; summary: string; reason: string; manager_note: string };
const 붙은것 = ((cs ?? []) as 후보[]).map((c) => {
  let lift = 0, 어긴수 = 0;
  try {
    const r = JSON.parse(String(c.reason ?? "{}"));
    const v = r.revive ?? r;
    lift = Number(v.lift ?? 0); 어긴수 = (v.counts?.a ?? 0) + (v.counts?.b ?? 0);
  } catch { /* 옛 줄 */ }
  return { ...c, lift, 어긴수, 올라갔나: 올라간것.has(c.id) };
}).sort((a, b) => b.lift - a.lift);

/**
 * **같은 말을 두 번 싣지 않는다.** 되살린 것들 중에 말만 바꾼 쌍이 여럿 있었다
 * ("영상 첫 장면은 3초 안에 끝낸다" 와 "첫 장면은 3초 안에 끝내고 나머지 장면에 시간을 나눈다").
 * 자리가 16개뿐인데 같은 규칙이 둘을 먹으면 그건 강화가 아니라 낭비다.
 * 글자 세 쪽(3-gram)이 반 넘게 겹치면 같은 것으로 보고 **센 쪽만** 남긴다.
 */
const 세쪽 = (t: string) => {
  const g = String(t).replace(/[^가-힣a-zA-Z0-9]/g, "");
  const out = new Set<string>();
  for (let i = 0; i + 3 <= g.length; i++) out.add(g.slice(i, i + 3));
  return out;
};
const 겹침 = (a: string, b: string) => {
  const x = 세쪽(a), y = 세쪽(b);
  if (!x.size || !y.size) return 0;
  let n = 0; for (const t of x) if (y.has(t)) n++;
  return n / Math.min(x.size, y.size);
};

const 안올라간것_전부 = 붙은것.filter((x) => !x.올라갔나);
const 겹친것: { 버림: string; 때문에: string; 값: number }[] = [];
const 안올라간것: typeof 안올라간것_전부 = [];
for (const x of 안올라간것_전부) {   // lift 센 것부터 정렬돼 있다 — 먼저 든 쪽이 센 쪽이다
  const 글 = `${x.title} ${x.summary}`;
  const 같은것 = [...안올라간것, ...((이미 ?? []) as any[]).map((k) => ({ title: k.title, summary: "" }))]
    .find((y: any) => 겹침(글, `${y.title} ${y.summary ?? ""}`) > 0.5);
  if (같은것) { 겹친것.push({ 버림: String(x.title).slice(0, 48), 때문에: String((같은것 as any).title).slice(0, 48), 값: 겹침(글, `${(같은것 as any).title} ${(같은것 as any).summary ?? ""}`) }); continue; }
  안올라간것.push(x);
}
if (겹친것.length) {
  console.log(`
── 같은 말이라 **뺀 것** ${겹친것.length}개 ──`);
  for (const d of 겹친것) console.log(`  (${(d.값 * 100).toFixed(0)}% 겹침) ${d.버림}
        ↑ 이미 있는 것: ${d.때문에}`);
}
const 빈자리 = Math.max(0, MAX_KNOWLEDGE_PER_EXECUTION - 검증된것);
const 올릴것 = 안올라간것.slice(0, 빈자리);
const 남는것 = 안올라간것.slice(빈자리);

console.log(`붙은 규칙 ${붙은것.length}개 · 이미 올라간 것 ${붙은것.length - 안올라간것.length}개 · **빈자리 ${빈자리}개**\n`);
console.log(`── 올릴 것 (lift 센 것부터) ──`);
for (const x of 올릴것) console.log(`  lift ${x.lift.toFixed(2)} · 어긴 사례 ${String(x.어긴수).padStart(3)} · ${String(x.title).slice(0, 60)}`);
if (남는것.length) {
  console.log(`\n── 자리가 모자라 **안 올리는 것** ${남는것.length}개 (장부엔 붙은 채로 남는다) ──`);
  for (const x of 남는것) console.log(`  lift ${x.lift.toFixed(2)} · ${String(x.title).slice(0, 60)}`);
  console.log(`  → 프롬프트가 16개까지만 싣기 때문이다. 더 올리려면 상한을 올려야 하고, 상한은 값이다(모든 일마다 실린다).`);
}

if (!쓰나) { console.log(`\n(재기만 했다. 올리려면 --write)`); process.exit(0); }
let 올림 = 0;
for (const x of 올릴것) {
  const { error } = await db.from("organization_knowledge").insert({
    company_id: CO,
    title: `${String(x.title).slice(0, 100)} (검증된 규칙)`,
    description: x.summary || x.title,
    category: "quality_improvement",
    status: "active",
    learning_candidate_id: x.id,
  });
  if (error) console.error(`  올리기 실패: ${error.message}`); else 올림++;
}
console.log(`\n**${올림}개 올렸다.** 프롬프트가 다음 일부터 읽는다.`);
