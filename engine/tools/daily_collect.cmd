@echo off
rem Daily data-collection batch (219, 2026-09-25): customer AI writes 3 orders -> intake -> work -> score. Gate: company weekly cap, stop at $9.5.
cd /d C:\Users\az518\Desktop\ai-workforce
echo ===== %date% %time% >> engine\work\anything\daily.log
call npx tsx engine/tools/rookery_env.mts engine/tools/order_gen.mts --n 3 >> engine\work\anything\daily.log 2>&1
for /f "delims=" %%f in ('dir /b /o-d engine\work\anything\orders\*.json') do (set LATEST=%%f & goto :got)
:got
call npx tsx engine/tools/rookery_env.mts engine/tools/order_score.mts engine\work\anything\orders\%LATEST% --wait >> engine\work\anything\daily.log 2>&1
