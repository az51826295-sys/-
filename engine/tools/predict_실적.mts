/**
 * **고리 안 예측자가 값을 하나** (10-13). 모델 0 · 값 0.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/predict_실적.mts [일수=60]
 *
 * 10-12 에 "예측자를 동결하자" 는 말이 나왔는데, **둘이 서로 다른 것**이었다:
 *   · `judge_predict.mts` (Brier 0.249 vs 밑바탕 0.253) — **도구**다. 불러야 돌고, 지금 안 돈다.
 *   · `predictMeasures` (appBuild/loop) — **고치는 고리 안**에서 판마다 모델을 부른다. 이게 돈다.
 * 동결하자던 쪽은 이미 잠들어 있고, **도는 쪽은 아무도 안 쟀다.**
 *
 * 그래서 **이미 산 답**을 읽어 센다. 예측은 `work_executions.metrics_json.predictions` 에
 * 잠글 때 적히고(`lockPrediction`), 재고 나서 채점이 붙는다(`markScored`).
 * 새로 사지 않는다 — 호출 0.
 *
 * 밑바탕: 늘 "통과한다" 고 찍는 것. 그걸 못 이기면 예측이 값을 안 하는 것이다.
 */
import { createClient } from "@supabase/supabase-js";

const 일수 = Number(process.argv[2] ?? 60);
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const 부터 = new Date(Date.now() - 일수 * 864e5).toISOString();

const 들: any[] = [];
for (let 쪽 = 0; ; 쪽++) {
  const { data, error } = await db.from("work_executions").select("id, created_at, metrics_json")
    .gte("created_at", 부터).order("created_at", { ascending: true }).range(쪽 * 500, 쪽 * 500 + 499);
  if (error) { console.error("못 읽음:", error.message); process.exit(1); }
  들.push(...(data ?? []));
  if (!data || data.length < 500) break;
  if (쪽 > 40) break;
}

type 채점 = { brier?: number; 오차?: Record<string, number>; 견줌?: number };
const 판들: { brier: number; 통과: boolean }[] = [];
const 오차들: number[] = [];
let 실행수 = 0;
for (const r of 들) {
  const ps = (r.metrics_json?.predictions ?? []) as { 통과확률?: number; 채점?: 채점 }[];
  if (!Array.isArray(ps) || !ps.length) continue;
  실행수++;
  for (const p of ps) {
    const c = p.채점;
    if (!c || typeof c.brier !== "number" || typeof p.통과확률 !== "number") continue;
    /* 채점에 적힌 brier 는 (확률 − 실제)². 실제가 뭐였는지는 거기서 되짚는다. */
    const 실제통과 = Math.abs(p.통과확률 - 1) ** 2 - c.brier < 1e-6 ? true : false;
    판들.push({ brier: c.brier, 통과: 실제통과 });
    for (const v of Object.values(c.오차 ?? {})) if (typeof v === "number") 오차들.push(Math.abs(v));
  }
}

console.log(`최근 ${일수}일 — 실행 ${들.length}건 중 예측이 적힌 것 ${실행수}건 · **채점된 예측 ${판들.length}판**\n`);
if (!판들.length) {
  console.log("  채점된 예측이 없다 — **이 자는 판정하지 않는다.**");
  console.log("  (0 은 '못 본다' 일 수 있다 — 세기 전에 그 칸에 값이 들어가는 길이 있나 본다.)");
  console.log("");
  console.log("  **10-13 에 그 길을 따라가 봤다**: `predictMeasures` 는 `o.guards?.length` 일 때만 돈다.");
  console.log("  guards 는 `ctx.context.roleInput.webGuards` 에서만 오는데, **저장소 전체에서 그걸 채우는 곳이 없다.**");
  console.log("  그래서 이 예측자는 **한 번도 돈 적이 없다** — 값도 0, 기록도 0. 전체 실행 463건에서 0건.");
  console.log("  '동결' 할 것이 아니라, **켤지 말지를 정해야 하는 것**이다.");
  process.exit(0);
}

const 평균 = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const 실제통과율 = 판들.filter((x) => x.통과).length / 판들.length;
const 예측Brier = 평균(판들.map((x) => x.brier));
/* **밑바탕 둘** — 이보다 못하면 예측이 값을 안 한다 */
const 늘통과 = 평균(판들.map((x) => (1 - (x.통과 ? 1 : 0)) ** 2));
const 비율만 = 평균(판들.map((x) => (실제통과율 - (x.통과 ? 1 : 0)) ** 2));
const 한건값 = 1 / 판들.length;

console.log(`  실제 통과율        ${(실제통과율 * 100).toFixed(0)}%`);
console.log(`  예측자 Brier       ${예측Brier.toFixed(3)}`);
console.log(`  밑바탕 "늘 통과"   ${늘통과.toFixed(3)}`);
console.log(`  밑바탕 "비율만"    ${비율만.toFixed(3)}  ← 이걸 못 이기면 값을 안 한다`);
console.log(`  (한 판이 뒤집히면 Brier 가 ${한건값.toFixed(3)} 만큼 움직인다)`);
if (오차들.length) console.log(`\n  값 예측 오차: ${오차들.length}칸 · 평균 ${평균(오차들).toFixed(2)}`);

const 차 = 비율만 - 예측Brier;
console.log(`\n  ${차 > 한건값 ? `**예측이 밑바탕을 이긴다** (차 ${차.toFixed(3)} > 한 건 값 ${한건값.toFixed(3)})`
  : `**못 가른다** — 차 ${차.toFixed(3)} 는 한 건 값(${한건값.toFixed(3)}) 안이다.`}`);
console.log(`  이 자는 **새로 사지 않는다** — 이미 산 답을 읽은 것뿐이다(호출 0).`);
