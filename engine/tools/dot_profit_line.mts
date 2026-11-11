/**
 * # 적자가 언제 나나 — **나가는 돈과 들어오는 돈을 같은 자리에** (11-11)
 *
 *   SCRATCH=<dotvars 있는 곳> npx tsx engine/tools/dot_profit_line.mts
 *
 * 사장님: *"내가 생각한 건 적자가 언제 날까?"*
 *
 * 답부터: **"언제" 가 아니라 이미 난다.** 다만 적자의 모양이 중요하다 —
 * 두근도트의 비용은 **사람이 늘어도 거의 안 는다**(서버는 켜 두는 값이고, 말 한 번이 0.457원).
 * 그래서 이 자는 세 수를 같이 적는다: **고정비 · 사람당 수입 · 본전에 필요한 사람 수.**
 *
 * ## 조심한 것
 *
 * - Railway 요금은 **워크스페이스 하나**가 로키와 두근도트를 같이 쓴다. 두근도트 몫만 떼서
 *   말하면 거짓이 되므로 **같이 쓰는 값**이라고 적고, 혼자 쓸 때의 값도 같이 적는다.
 * - Pro 요금제는 **$20 이 먼저 나가고 그 안에서 쓴다.** 그래서 "쓴 값"이 $20 아래면
 *   더 써도 공짜처럼 보이지만, **넘는 순간부터 진짜로 더 나간다** — 그 선을 같이 적는다.
 * - 광고 수입은 **노출당 5원**이라는 내 추정이다. 진짜 광고가 붙은 적이 없어 실측이 없다.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const 환율 = 1460;                    // 원/달러, 대략
const 턴값 = 0.457;                   // 말 한 번 원가(실측, deepseek 캐시 포함)
const 노출값 = 5;                     // 광고 1회 수입(원) — **추정**
const 플랜 = 20;                      // Railway Pro 월 고정($)

const 레일 = (() => {
  const p = `${process.env.APPDATA ?? ""}\\npm\\railway.cmd`;
  try { execFileSync("cmd", ["/c", p, "--version"], { stdio: "ignore" }); return p; } catch { return "railway"; }
})();
let 쓴값 = NaN, 예상 = NaN;
try {
  const u = JSON.parse(execFileSync("cmd", ["/c", 레일, "usage", "--json"], { encoding: "utf8" }));
  쓴값 = Number(u.currentUsageDollars); 예상 = Number(u.estimatedBillDollars);
} catch { /* 못 읽으면 아래에서 — 로 적는다 */ }

/* 들어오는 쪽: 사람이 보낸 말 = 하트 = 광고 (사장님 규칙 "하트 하나당 광고 1") */
const vars = JSON.parse(readFileSync(process.env.SCRATCH + "/dotvars.json", "utf8")) as Record<string, string>;
process.env.NEXT_PUBLIC_SUPABASE_URL = vars.NEXT_PUBLIC_SUPABASE_URL;
process.env.SUPABASE_SECRET_KEY = vars.SUPABASE_SECRET_KEY;
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { CHECKIN_HEARTS } = await import("../../src/lib/dot/bond");
const db = createServiceClient();

const 부터 = new Date(Date.now() - 30 * 86_400_000).toISOString();
const { data, error } = await db.from("dot_messages").select("user_id, created_at").eq("role", "user").gte("created_at", 부터);
if (error) { console.log(`❌ 못 셌다: ${error.message}`); process.exit(1); }
const 말 = (data ?? []) as { user_id: string; created_at: string }[];
const 사람 = new Set(말.map((m) => m.user_id)).size;
const 칸 = new Map<string, number>();
for (const m of 말) { const k = `${m.user_id}|${m.created_at.slice(0, 10)}`; 칸.set(k, (칸.get(k) ?? 0) + 1); }
/** 공짜 하트를 넘긴 말만 광고가 된다 — 지금 설정에서는 거의 없다. */
const 광고횟수 = (공짜: number) => [...칸.values()].reduce((a, n) => a + Math.max(0, n - 공짜), 0);

const 원 = (n: number) => `${Math.round(n).toLocaleString()}원`;
console.log(`\n=== 두근도트 손익 (최근 30일) ===\n`);
console.log(`## 나가는 돈`);
console.log(`  Railway Pro 월 고정        $${플랜} = ${원(플랜 * 환율)}   ← 로키와 **같이** 쓴다`);
console.log(`  이번 기간 실제로 쓴 값     $${Number.isNaN(쓴값) ? "—" : 쓴값.toFixed(2)} (예상 $${Number.isNaN(예상) ? "—" : 예상.toFixed(2)})`);
console.log(`     → $${플랜} 까지는 요금에 포함이다. **넘으면 그때부터 진짜로 더 나간다.**`);
console.log(`  모델값(말 ${말.length}번 × ${턴값}원)      ${원(말.length * 턴값)}   ← 없는 것과 같다`);
console.log(`  Supabase                   (확인 필요 — 무료 요금제면 0원)`);

console.log(`\n## 들어오는 돈 (광고, 노출당 ${노출값}원 **추정**)`);
for (const 공짜 of [CHECKIN_HEARTS, 3, 1, 0]) {
  const n = 광고횟수(공짜);
  console.log(`  공짜 하트 ${공짜}개 → 광고 ${String(n).padStart(3)}회 = 월 ${원(n * 노출값).padStart(7)}${공짜 === CHECKIN_HEARTS ? "  ← 지금" : ""}`);
}

console.log(`\n## 본전에 필요한 사람 (지금 쓰는 만큼 쓴다고 치고)`);
for (const 공짜 of [CHECKIN_HEARTS, 0]) {
  const 사람당 = (광고횟수(공짜) * 노출값) / Math.max(1, 사람);
  const 필요 = 사람당 > 0 ? Math.round((플랜 * 환율) / 사람당) : Infinity;
  console.log(`  공짜 ${공짜}개: 1인당 월 ${원(사람당)} → 서버값을 광고로 내려면 **${필요 === Infinity ? "불가능" : 필요.toLocaleString() + "명"}**`);
}
console.log(`\n  (지금 말을 건 사람 ${사람}명. 하트 10개 1,200원을 월 ${Math.ceil((플랜 * 환율) / 1200)}명만 사도 같은 금액이다.)`);
console.log(`\n  **비용은 사람이 늘어도 거의 안 는다** — 서버는 켜 두는 값이고 말 한 번이 ${턴값}원이다.`);
console.log(`  그래서 적자는 "언제 나나" 가 아니라 **"사람이 몇이면 사라지나"** 가 맞는 물음이다.`);
