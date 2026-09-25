/**
 * **오늘 고친 것들이 살아 있나** — 한 명령으로 네 자를 잰다 (217회차 09-25, 로키 next_work 제안 넷이 전부 "더 많은 표본으로 재검증").
 * 돈 0. 기준일(--since, 기본 09-24T16:02Z = 형식 고장 고침 배포) 뒤의 실행·결과물만 센다.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/health.mts [--since 2026-09-24T16:02:00Z]
 */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const since = arg("--since") ?? "2026-09-24T16:02:00Z";
const { data: ex } = await db.from("work_executions").select("status, error_message, current_step, error_code").gte("created_at", since).neq("error_code", "WAITING_APPROVAL").limit(2000);   // 기다림(사장님 확인 대기)은 실패가 아니다
const rows = (ex ?? []) as { status: string; error_message: string | null; current_step: string }[];
const fmt = rows.filter((r) => /MODEL_OUTPUT_(OFF_SCHEMA|UNPARSEABLE)/.test(r.error_message ?? "")).length;
const trunc = rows.filter((r) => /MODEL_OUTPUT_TRUNCATED/.test(r.error_message ?? "")).length;
console.log(`① 형식 고장(모양·못 읽음)으로 죽은 실행: ${fmt}/${rows.length} (${rows.length ? ((fmt / rows.length) * 100).toFixed(1) : "-"}%) — 기준일 ${since.slice(0, 16)} 뒤`);
console.log(`④ 잘림(TRUNCATED)으로 죽은 실행: ${trunc}/${rows.length}`);
const { data: vids } = await db.from("deliverables").select("id, created_at, content_json").eq("deliverable_type", "video").gte("created_at", since).order("created_at", { ascending: false }).limit(100);
let n = 0, sceneFail = 0, textFail = 0, sjRan = 0, sjNull = 0, scenes = 0, absSum = 0;
for (const d of (vids ?? []) as Record<string, any>[]) {
  const c = d.content_json ?? {}; n++;
  for (const k of (c.verdict?.cases ?? []) as { name: string; result: string }[]) { if (k.name === "장면_계획_대비" && k.result === "Failed") sceneFail++; if (k.name === "화면_글자_있음" && k.result === "Failed") textFail++; }
  if ("scriptJudge" in c) { if (c.scriptJudge) sjRan++; else sjNull++; }
  const plan = (c.script?.scenes ?? []).map((s: any) => Number(s.seconds)); const real = (c.durations ?? []).map(Number);
  if (plan.length && plan.length === real.length) for (let i = 0; i < plan.length; i++) { scenes++; absSum += Math.abs(plan[i] - real[i]); }
}
console.log(`② 영상 ${n}판: 장면_계획_대비 실패 ${sceneFail} · 장면당 오차 평균 ${scenes ? (absSum / scenes).toFixed(2) : "-"}초 (${scenes}장면)`);
console.log(`③ 화면_글자_있음 실패 ${textFail}/${n}`);
console.log(`④' 대본 심판: 돎 ${sjRan} · 못 돎(null) ${sjNull} (심판 칸이 있는 판만)`);
