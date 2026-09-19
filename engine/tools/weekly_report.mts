// 이번 주 AI 보고 세 줄 (190회차). 돈 0.   npx tsx engine/tools/rookery_env.mts engine/tools/weekly_report.mts [--post] [--days 7]
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { weeklyLines, postWeekly, weekKey } = await import("../../src/lib/genesis/weekly");
const db = createServiceClient();
const di = process.argv.indexOf("--days");
const { lines } = await weeklyLines(db, di > 0 ? Number(process.argv[di + 1]) : 7);
console.log(`이번 주 AI 보고 (${weekKey()} 주)`); for (const l of lines) console.log("- " + l);
if (process.argv.includes("--post")) console.log(await postWeekly(db, console.log, { force: true }) ? "붙임" : "못 붙임");
