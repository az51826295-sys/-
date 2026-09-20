/** 얼린 대기열을 사장님이 훑어보게 한 장으로. */
import { readFileSync, writeFileSync } from "node:fs";
const d = JSON.parse(readFileSync("engine/docs/genesis/unattended-queue-2.json", "utf8"));
const e = d.estimate, m = d.mix;
const L = [
  "# 무인 판 2 — 얼린 대기열 60개 (순서 고정)", "",
  `가벼움 ${m.가벼움} · 중간 ${m.중간} · 무거움 ${m.무거움} · 일부러 깨지는 것 ${m.깨지는것}`, "",
  "## 먼저 보실 것 — **$2 는 6시간을 못 삽니다**", "",
  "| | |", "|---|---|",
  `| 상한에 닿는 자리 | **${e["상한에 닿는 자리"]}** |`,
  `| 60판 전부 돌리면 | $${e["예상 총액(60판 전부)"]} · ${e["예상 총시간(60판 전부)"]} |`,
  `| 잠근 상한 | $${e.상한} (하루 상한 $5) |`, "",
  "단가 근거(14일 실측 166판): 값 25% \$0.056 · 중앙 \$0.159 · 75% \$0.293 · 95% \$0.727.",
  "**무거운 판은 아직 한 번도 안 돌려 봤습니다** — 75~95% 구간을 갖다 쓴 추정입니다.", "",
  "구간: " + (e.구간 as string[]).join(" · "), "",
  "## 순서", "", "| # | 무게 | 제목 |", "|---:|---|---|",
  ...d.items.map((x: { n: number; weight: string; title: string; expectFail: boolean }) =>
    `| ${x.n} | ${x.weight}${x.expectFail ? " ⚠" : ""} | ${x.title}${x.n <= 16 ? "" : " _(상한 밖)_"} |`),
  "", "⚠ = 일부러 깨지는 과제. 6번·12번 — **상한이 닿을 자리 안쪽**이라야 실패 경로가 실제로 돕니다.",
  "6칸 떨어져 있어 문지기의 '같은 실패 3연속' 에는 안 걸립니다.",
  "실패는 보장되지 않습니다 — 계획 모델이 빈 주문에서도 기준을 지어낼 수 있습니다.",
];
writeFileSync("engine/docs/genesis/unattended-queue-2.md", L.join("\n") + "\n", "utf8");
console.log("적음: engine/docs/genesis/unattended-queue-2.md");
