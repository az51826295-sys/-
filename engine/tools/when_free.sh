#!/bin/sh
# 기계가 비면 한 번에 돌리는 것들 (09-23). 브라우저를 겹쳐 띄우지 않게 순서대로.
cd /c/Users/az518/Desktop/ai-workforce || exit 1
echo "=== ① 후보 (나): 원본 + 발판 y350 ==="
npx tsx engine/tools/rookery_env.mts engine/tools/play_one.mts engine/work/candidate-na/index.html 2>&1 | grep -vE "^\[로키"
echo "=== ② 게임.클리어 칸 시험 (고리 길 그대로) ==="
npx tsx engine/tools/rookery_env.mts engine/tools/clear_probe.mts 2>&1 | grep -vE "^\[로키"
