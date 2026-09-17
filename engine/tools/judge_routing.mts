/**
 * 심판자가 배치를 정할 수 있는가 (134회차 09-16). 돈 0, 모델 0.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/judge_routing.mts
 *
 * 사장님 09-16: **"판단자 ai 잘 만들면 모든 에이아이를 적재적소에 쓰며 더 높은 효율을 낼 수 있다."**
 *
 * 지금 모델 배치는 **내가 손으로 적은 고정표**다 — `providers/router.ts` 의 `ECONOMY_TIERS` 가 전부이고,
 * 126회차 아스트라 시험 뒤에 "분석은 아스트라, 영상은 싼 모델" 이라 정한 것도 내가 표를 고친 것이다.
 * 사장님 말대로 하려면 그 표가 **판정에서 나와야** 한다.
 *
 * 이 자가 그 다리다. (자리, 모델)마다 심판자 판정을 세어 성적표를 낸다.
 *   · 자리 = 어떤 일인가(영상·분석·유니티)
 *   · 모델 = 그 일을 실제로 한 모델
 *   · 성적 = 심판자가 '통과' 한 비율, 그리고 **헛치명**(멀쩡한 것을 되돌리려 한 횟수)
 *
 * **아직 배치를 바꾸지 않는다.** 표만 낸다. 바꾸려면 두 가지가 먼저다:
 *   ① 자리마다 판이 충분히 쌓일 것(한 판으로 모델을 갈아 치우면 그건 배치가 아니라 미신이다)
 *   ② **심판자 자신의 헛치명이 0일 것** — 심판자가 틀리면 그 틀림이 모든 배치로 곱해진다.
 * 09-16 하루에만 심판자가 셋 틀렸다(눈대중 대비·화면 글자에 말투 규칙·잘린 글자 통과). 그래서 ②가 먼저다.
 */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();

type Row = {
  id: string;
  deliverable_type: string;
  created_at: string;
  content_json: {
    judge?: { verdict?: string; faults?: { severity?: string }[]; scores?: Record<string, number> } | null;
    judgeBy?: string | null;
    workModel?: string | null;
    verdict?: { verdict?: string; passed?: number; failed?: number } | null;
  } | null;
};

const { data } = await db
  .from("deliverables")
  .select("id, deliverable_type, created_at, content_json")
  .order("created_at", { ascending: false })
  .limit(500);

const rows = ((data ?? []) as Row[]).filter((r) => r.content_json?.judge);

if (!rows.length) {
  console.log("심판자 판정이 붙은 결과물이 아직 없다.");
  console.log("  심판자는 09-16 에 영상 쪽에만 붙었다(막지 않고 옆에 적기만 한다).");
  console.log("  다음 영상 판부터 여기 쌓인다 — 판이 없을 때 표를 지어내지 않는 것이 이 자의 일이다.");
  console.log("\n지금 배치는 손으로 적은 고정표다: providers/router.ts 의 ECONOMY_TIERS.");
  process.exit(0);
}

type Cell = { n: number; pass: number; redo: number; unseen: number; fatal: number; scores: number[] };
const table = new Map<string, Cell>();
const cell = (k: string) => { const c = table.get(k) ?? { n: 0, pass: 0, redo: 0, unseen: 0, fatal: 0, scores: [] }; table.set(k, c); return c; };

let agree = 0, disagree = 0;
for (const r of rows) {
  const j = r.content_json!.judge!;
  const key = `${r.deliverable_type} × ${r.content_json!.workModel ?? "모름"}`;
  const c = cell(key);
  c.n++;
  if (j.verdict === "통과") c.pass++;
  else if (j.verdict === "못 봤다") c.unseen++;
  else c.redo++;
  if ((j.faults ?? []).some((f) => f.severity === "치명")) c.fatal++;
  const sc = j.scores ? Object.values(j.scores) : [];
  if (sc.length) c.scores.push(sc.reduce((a, b) => a + b, 0) / sc.length);

  // 기계 자와 심판자가 어긋나는 판 — 이게 심판자를 둔 이유다(만점인데 퇴짜, 또는 그 반대)
  const machinePass = r.content_json!.verdict?.verdict === "PASS";
  const judgePass = j.verdict === "통과";
  if (j.verdict !== "못 봤다") (machinePass === judgePass ? agree++ : disagree++);
}

console.log(`심판자 판정이 붙은 판 ${rows.length}건\n`);
console.log("자리 × 모델".padEnd(46), "판", "통과", "되돌림", "못봄", "치명", "평균점수");
for (const [k, c] of [...table].sort((a, b) => b[1].n - a[1].n)) {
  const avg = c.scores.length ? (c.scores.reduce((a, b) => a + b, 0) / c.scores.length).toFixed(1) : "—";
  console.log(k.padEnd(46), String(c.n).padStart(2), String(c.pass).padStart(4), String(c.redo).padStart(6), String(c.unseen).padStart(4), String(c.fatal).padStart(4), avg.padStart(8));
}

console.log(`\n기계 자와 심판자: 같은 판정 ${agree} · **어긋남 ${disagree}**`);
console.log("  어긋난 판이 심판자를 둔 이유다 — 09-08 에 기계 14/14 만점을 사장님이 네 번 되돌려 보냈다.");

const MIN = 8;
const ready = [...table].filter(([, c]) => c.n >= MIN);
console.log(`\n배치를 맡길 수 있나: 자리마다 ${MIN}판 이상 쌓인 칸 ${ready.length}개`);
if (!ready.length) console.log("  아직 아니다. 한 판으로 모델을 갈아 치우면 그건 배치가 아니라 미신이다.");
console.log("  그리고 **심판자 자신의 헛치명이 0** 이어야 한다 — 심판자가 틀리면 그 틀림이 모든 배치로 곱해진다.");
console.log("  (judge_teeth.mts · judge_style_probe.mts 가 그것을 잰다)");
