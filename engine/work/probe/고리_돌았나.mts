/**
 * **자가진화 고리가 어제·오늘 돌았나, 그리고 사례 창이 몇이었나** (10-13). 모델 0 · 값 0.
 *   npx tsx engine/tools/rookery_env.mts engine/work/probe/고리_돌았나.mts
 *
 * `learning_candidates` 가 10-11 에 멈춘 것을 보고 "고리가 죽었다" 고 할 뻔했다.
 * **후보가 0건인 것은 고리가 안 돈 것과 다르다** — 돌았는데 낼 것이 없었을 수 있다.
 * 그래서 **돌았다는 기록**(genesis_runs)을 본다. 돌긴 돌았다.
 *
 * 그 기록에 `cases.total` 이 적혀 있는데 **14일 내내 160** 이다. 10-01 에 창을 160→400 으로
 * 넓혔다고 적어 뒀다(채택률 8%→38%). 숫자가 안 움직였다 — 그래서 창도 같이 적는다.
 */
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

const { data, error } = await db.from("genesis_runs")
  .select("*").order("run_date", { ascending: false }).limit(14);
if (error) { console.error("genesis_runs 못 읽음:", error.message); process.exit(1); }

for (const r of (data ?? []) as Record<string, any>[]) {
  const res = (r.result ?? {}) as Record<string, any>;
  const 고리 = Object.entries(res).find(([k]) => /^[0-9a-f]{8}-/.test(k))?.[1]?.rules;
  if (!고리) { console.log(` ${r.run_date}  ${String(r.status).padEnd(6)} 규칙 고리 기록 없음`); continue; }
  const c = 고리.cases ?? {};
  console.log(` ${r.run_date}  total ${String(c.total).padStart(4)} · train ${String(c.train).padStart(3)}`
    + ` · holdout ${String(c.holdout).padStart(3)} · 부름 ${고리.calls ?? 0} · 채택 ${고리.adopted ?? 0}`
    + (고리.skipped ? ` · 건너뜀: ${String(고리.skipped).slice(0, 60)}` : ""));
}

const { data: hb } = await db.from("service_heartbeat").select("service, commit_sha, seen_at")
  .in("service", ["rookery-worker", "rookery-worker-dev"]);
console.log("");
for (const h of (hb ?? []) as Record<string, any>[]) {
  const 한국 = new Date(new Date(h.seen_at).getTime() + 9 * 3600_000).toISOString().slice(0, 16).replace("T", " ");
  console.log(` ${h.service} — ${h.commit_sha} · 마지막 숨 ${한국} KST`);
}
console.log(`\n (오늘 한국 날짜: ${new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)})`);
console.log(" **주의**: 워커가 보고하는 커밋은 지금 도는 코드고, 위 run 은 그날 04시에 돌던 코드다(09-26 기록).");
