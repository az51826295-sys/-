// 자리 시험판 v0 (190회차) — 모델 이름을 주면 고장 셋 고치기 + 그림 보기를 재서 한 줄로. 모델당 ≈$0.01.
//   npx tsx engine/tools/rookery_env.mts engine/tools/seat_bench.mts gpt-5.6-luna deepseek-v4-flash gpt-5.4-nano
const { runSeatBench, trialLine } = await import("../../src/lib/genesis/seatBench");
const models = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!models.length) { console.error("모델 이름을 하나 이상"); process.exit(2); }
for (const m of models) console.log(trialLine(await runSeatBench(m)));
