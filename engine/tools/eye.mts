/**
 * 눈 트랙 — 알림 보기 / 판정 달기 (195회차 09-20). 돈 0.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/eye.mts                      — 최근 7일 알림·오경보율
 *   npx tsx engine/tools/rookery_env.mts engine/tools/eye.mts --judge 20260920-1 쓸모없음 "이유"
 *   npx tsx engine/tools/rookery_env.mts engine/tools/eye.mts --dry                — 지금 목록으로 알림을 만들어만 본다(안 붙임)
 */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { recentAlerts, falseAlarmLine, judgeAlert, buildAlerts } = await import("../../src/lib/genesis/eye");
const db = createServiceClient();
const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };

if (arg("--judge")) {
  const id = arg("--judge")!;
  const useful = !/쓸모없|no|false/.test(process.argv[process.argv.indexOf("--judge") + 2] ?? "");
  const note = process.argv[process.argv.indexOf("--judge") + 3];
  console.log(await judgeAlert(db, id, useful, note) ? `판정함: ${id} → ${useful ? "쓸모있음" : "쓸모없음"}` : "그런 알림이 없다");
  process.exit(0);
}
if (process.argv.includes("--dry")) {
  const { watchModels } = await import("../../src/lib/providers/modelWatch");
  const { data: last } = await db.from("genesis_runs").select("result").eq("kind", "daily").not("result->models", "is", null).order("run_date", { ascending: false }).limit(1).maybeSingle();
  const prev = ((last?.result as any)?.models?.snapshot ?? null);
  const { report } = await watchModels(prev);
  const alerts = buildAlerts(report);
  console.log(`(안 붙임) 알림 ${alerts.length}건 — 새로 생김 ${report.fresh.length} · 없어짐 ${report.gone.length} · 우리가 쓰는데 사라짐 ${report.missingInUse.length}`);
  for (const a of alerts) console.log(`  ${a.urgent ? "급" : "  "} [${a.kind}] ${a.title}${a.detail ? " — " + a.detail : ""}`);
  process.exit(0);
}
const days = Number(arg("--days") ?? 7);
const alerts = await recentAlerts(db, days);
console.log(falseAlarmLine(alerts));
for (const a of alerts) console.log(`  ${a.useful === null ? "미판정" : a.useful ? "쓸모있음" : "쓸모없음"} ${a.id} ${a.urgent ? "급" : "  "} [${a.kind}] ${a.title}`);
