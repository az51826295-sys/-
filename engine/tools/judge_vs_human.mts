/**
 * **심판자는 뭐라 했고, 사장님은 뭐라 했나** — 나란히 (150회차 09-16). 돈 0, 모델 0.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/judge_vs_human.mts
 *
 * `judge-plan-2026-09-16.md` 4번. 심판자가 **좋은지**에는 잴 자가 없고, 만들어서도 안 된다.
 * 유일한 정답은 **사람의 반응**이다 — 09-08 에 사장님이 "투구 크기 개판" 이라고 친 그 말처럼.
 *
 * 그래서 이 자는 채점을 하지 않는다. **어긋난 판만 골라 놓는다.**
 *   · 심판자가 "멈춘다" 했는데 사람이 수정 요청 → 심판자가 너그러웠다
 *   · 심판자가 어색하다 했는데 사람이 승인 → 심판자가 까다로웠다
 * 여덟 판쯤 쌓이면 그 어긋난 것만 모아 본다. **그전에는 심판자를 고치지 않는다** —
 * 한 판 보고 고치면 그건 심판자를 고친 게 아니라 그 판에 맞춘 것이다.
 */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();

type D = {
  id: string; title: string; created_at: string; assignment_id: string | null; deliverable_type: string;
  content_json: { judge?: { firstGlance?: string; wouldStop?: string; awkward?: string; soulless?: string; oneChange?: string } | null } | null;
};

const { data: ds } = await db
  .from("deliverables")
  .select("id, title, created_at, assignment_id, deliverable_type, content_json")
  .order("created_at", { ascending: false })
  .limit(400);

const rows = ((ds ?? []) as D[]).filter((d) => d.content_json?.judge?.oneChange);
console.log(`결과물 ${(ds ?? []).length}건 중 심판자가 말한 것 **${rows.length}건**`);
if (!rows.length) { console.log("아직 없다. 영상을 한 판 만들면 붙는다."); process.exit(0); }

const asg = rows.map((r) => r.assignment_id).filter(Boolean) as string[];
const { data: sibs } = await db.from("deliverables").select("id, assignment_id").in("assignment_id", asg);
const byAsg = new Map<string, string[]>();
for (const s of (sibs ?? []) as { id: string; assignment_id: string }[]) {
  byAsg.set(s.assignment_id, [...(byAsg.get(s.assignment_id) ?? []), s.id]);
}
const allIds = [...new Set([...rows.map((r) => r.id), ...[...byAsg.values()].flat()])];
const { data: revs } = await db
  .from("deliverable_reviews").select("deliverable_id, decision, feedback, created_at").in("deliverable_id", allIds);
const revByD = new Map<string, { decision: string; feedback: string | null }>();
for (const r of (revs ?? []) as { deliverable_id: string; decision: string; feedback: string | null }[]) revByD.set(r.deliverable_id, r);

let agreed = 0, mismatched = 0, unjudgedByHuman = 0;
for (const r of rows) {
  const j = r.content_json!.judge!;
  const sibIds = r.assignment_id ? byAsg.get(r.assignment_id) ?? [r.id] : [r.id];
  const human = sibIds.map((i) => revByD.get(i)).find(Boolean) ?? null;
  const when = new Date(r.created_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

  // 심판자가 "넘긴다/안 멈춘다" 는 쪽인가. 자를 만들지 않으려고 **말 그대로만** 본다.
  const negative = /넘길|넘긴|스크롤|지나칠|안 멈|못 멈|넘어갈/.test(j.wouldStop ?? "");
  const verdictWord = negative ? "넘긴다" : "멈춘다";
  const humanWord = human ? (human.decision === "approved" ? "승인" : "수정 요청") : "(아직 안 봄)";

  let mark = " ";
  if (!human) { unjudgedByHuman++; }
  else if ((negative && human.decision === "approved") || (!negative && human.decision !== "approved")) { mark = "≠"; mismatched++; }
  else { agreed++; }

  console.log(`\n${mark} ${when} · ${r.title.slice(0, 40)}`);
  console.log(`   심판자 ${verdictWord} — ${(j.wouldStop ?? "").slice(0, 90)}`);
  console.log(`   하나만 바꾼다면 — ${(j.oneChange ?? "").slice(0, 90)}`);
  console.log(`   사장님 ${humanWord}${human?.feedback ? ` — ${human.feedback.slice(0, 80)}` : ""}`);
}

console.log(`\n── 같은 쪽 ${agreed} · **어긋남 ${mismatched}** · 사람이 아직 안 본 것 ${unjudgedByHuman}`);
console.log(mismatched >= 3 || agreed + mismatched >= 8
  ? "판이 쌓였다. 어긋난 것만 모아 심판자를 손볼 때다."
  : `아직 ${8 - agreed - mismatched}판 더. 그전에 심판자를 고치면 그 판에 맞추는 것이다.`);
