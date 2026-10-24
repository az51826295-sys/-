/**
 * 무료 한도를 몇으로 할까 · "무제한"은 얼마까지 새나 (10-25).
 * 값을 정하기 전에 **지금 쓰는 모양**에 대 본다.
 */
import { readFileSync } from "node:fs";

const 뿌리 = "C:/Users/az518/Desktop/ai-workforce";
const d = JSON.parse(readFileSync(뿌리 + "/engine/work/dot-이사/dot-dump.json", "utf8"));
const 하루들 = (d.dot_usage ?? []).map((u) => u.turns ?? 0).filter((n) => n > 0);
const 턴 = d.dot_turns ?? [];

console.log("── 무료 한도를 N 으로 하면 (말한 날 " + 하루들.length + "일 기준)");
console.log("   N   막히는 날   비율");
for (const N of [3, 5, 8, 10, 15, 20, 30]) {
  const 막힘 = 하루들.filter((x) => x > N).length;
  console.log("   " + String(N).padStart(2) + "    " + String(막힘).padStart(3) + "일      " + (막힘 / 하루들.length * 100).toFixed(0) + "%");
}

/* 한 턴 값 — deepseek-v4-flash 한 가지만 쓰였다 */
const 쓴것 = 턴.filter((t) => (t.input_tokens ?? 0) > 0);
const inAvg = 쓴것.reduce((a, t) => a + (t.input_tokens ?? 0), 0) / 쓴것.length;
const outAvg = 쓴것.reduce((a, t) => a + (t.output_tokens ?? 0), 0) / 쓴것.length;
const cached = 쓴것.reduce((a, t) => a + (t.cached_tokens ?? 0), 0) / 쓴것.length;
console.log("\n── 한 턴 (" + 쓴것.length + "건 평균): 들어감 " + Math.round(inAvg) + " · 그중 캐시 " + Math.round(cached) + " · 나옴 " + Math.round(outAvg));

/**
 * deepseek 공개 단가(2026-10 기준으로 내가 아는 값, **확인 필요**):
 *   입력 캐시미스 $0.27 / 1M · 캐시히트 $0.07 / 1M · 출력 $1.10 / 1M
 * 숫자가 바뀌었을 수 있으니 **단가는 반드시 다시 확인할 것.**
 */
const 미스 = Math.max(0, inAvg - cached);
const 턴값 = (미스 * 0.27 + cached * 0.07 + outAvg * 1.10) / 1e6;
console.log("   → 한 턴 약 $" + 턴값.toFixed(6) + " (약 " + (턴값 * 1400).toFixed(3) + "원)  *단가는 확인 필요*");

console.log("\n── 월 4,900원(약 $3.5) 구독자가 '무제한' 으로 쓰면");
const 본전 = 3.5 / 턴값;
console.log("   본전 턴 수: 약 " + Math.round(본전).toLocaleString() + "턴/월 (하루 " + Math.round(본전 / 30).toLocaleString() + "턴)");
const 제일많이쓴날 = Math.max(...하루들);
console.log("   지금 제일 많이 쓴 날이 " + 제일많이쓴날 + "턴 → 그 사람이 매일 그래도 월 " + (제일많이쓴날 * 30).toLocaleString() + "턴, 값 $" + (제일많이쓴날 * 30 * 턴값).toFixed(2));
console.log("\n   즉 **지금 쓰는 모양으로는 무제한이 안 터진다.** 다만 한 명이 하루 " + Math.round(본전 / 30).toLocaleString() + "턴을 넘기면 그 사람에게서 손해가 난다.");
console.log("   자동 매크로나 한 사람이 종일 돌리는 경우가 그렇다 → **상한은 없애도 '하루 N턴 넘으면 느려짐/알림' 같은 난간은 남기는 게 안전하다.**");
