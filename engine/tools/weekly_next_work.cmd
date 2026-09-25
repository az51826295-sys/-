@echo off
cd /d C:\Users\az518\Desktop\ai-workforce
echo ===== %date% %time% >> engine\work\anything\next-work-weekly.log
call npx tsx engine/tools/rookery_env.mts engine/tools/next_work.mts --days 7 --out engine/work/anything/next-work-weekly.json >> engine\work\anything\next-work-weekly.log 2>&1
call npx tsx engine/tools/rookery_env.mts engine/tools/next_work.mts --days 7 --seat deepseek-v4-pro --out engine/work/anything/next-work-weekly-deepseek.json >> engine\work\anything\next-work-weekly.log 2>&1
rem 221: proposals -> code. Picks the first human-hands=false, cost-0 proposal; gate = tsc + probe_all + ask-judge; local commit only (no push/deploy).
call npx tsx engine/tools/rookery_env.mts engine/tools/self_fix.mts --from engine/work/anything/next-work-weekly.json --auto >> engine\work\anything\next-work-weekly.log 2>&1
