/**
 * **광고를 볼 사람이 있나** — 붙이기 전에 센다 (11-05 다듬기 계획 ①).
 *
 *   npx tsx engine/tools/dot_ad_peek.mts [날수=30]
 *
 * 10-25 에 광고를 걷어낸 근거는 *"본 사람 0명"* 이었다. 그런데 그때 무료가 30회라
 * **한도에 닿는 날이 거의 없었다** — 단추를 볼 자리에 간 사람이 없었던 것이지,
 * 단추가 싫었던 게 아니다([[dot-ad-reward]]). "아무도 안 썼다" 를 볼 때
 * **볼 수 있었는지**를 먼저 보는 자다.
 *
 * 모델 0 · 값 0. 읽기만 한다(쓰지 않는다).
 *
 * ## 세는 법 (정직하게)
 *
 * 한도에 닿은 날 = `turns >= 무료 + bonus_turns`. 즉 **그날 더 못 보낸** 날이다.
 * 구독자는 상한이 없어 여기 안 잡힌다 — 그래서 아래 "사람" 은 *무료로 쓰는 사람* 이다.
 * 자가 만들고 지운 시험 계정은 `2026-01-0x` 날짜를 쓰므로 최근 날수 안에 안 든다.
 *
 * **못 세는 것**: 한도 카드를 실제로 **봤는지**는 모른다(화면 기록이 없다).
 * 한도에 닿은 날은 카드가 뜨는 날이므로 **상한선**으로 읽을 것.
 */
import { readFileSync } from "node:fs";

const 날수 = Number(process.argv[2] ?? 30);

/** 두근도트 전용 Supabase — 로키 것이 아니다([[dot-moved-to-own-org]]). */
const vars = JSON.parse(readFileSync(process.env.SCRATCH + "/dotvars.json", "utf8")) as Record<string, string>;
process.env.NEXT_PUBLIC_SUPABASE_URL = vars.NEXT_PUBLIC_SUPABASE_URL;
process.env.SUPABASE_SECRET_KEY = vars.SUPABASE_SECRET_KEY;

const { createServiceClient } = await import("../../src/lib/supabase/service");
const { AD_REFILLS_PER_DAY, AD_REFILL_TURNS, AD_NUDGE_AT } = await import("../../src/lib/dot/money");
const { FREE_TURNS_PER_DAY } = await import("../../src/lib/dot/bond");

const db = createServiceClient();
const 부터 = new Date(Date.now() - 날수 * 86_400_000).toISOString().slice(0, 10);

type Row = { user_id: string; day: string; turns: number; bonus_turns: number | null; ad_refills: number | null; paid_turns: number | null };
const { data, error } = await db
  .from("dot_usage").select("user_id, day, turns, bonus_turns, ad_refills, paid_turns")
  .gte("day", 부터);
if (error) { console.log(`  ❌ 못 셌다: ${error.message}`); process.exit(1); }
const rows = (data ?? []) as Row[];

const 닿음 = (r: Row) => r.turns >= FREE_TURNS_PER_DAY + Number(r.bonus_turns ?? 0);
/**
 * 11-06: **자의 범위를 제품에 맞춘다**([[ruler-scope-must-match-product]]).
 * 이 자는 "벽에 닿은 날" 만 셌는데, 같은 날 광고 단추를 **벽 앞**(하트 `AD_NUDGE_AT` 개 이하)으로
 * 옮겼다. 자를 그대로 두면 단추가 보이는 날을 0 으로 세고, 옮긴 보람이 장부에 안 나타난다.
 */
const 볼수있던날 = (r: Row) =>
  r.turns >= FREE_TURNS_PER_DAY + Number(r.bonus_turns ?? 0) - AD_NUDGE_AT;
const 사람 = new Set(rows.map((r) => r.user_id));
const 닿은날 = rows.filter(닿음);
const 본날 = rows.filter(볼수있던날);
const 닿은사람 = new Set(닿은날.map((r) => r.user_id));
const 광고본횟수 = rows.reduce((a, r) => a + Number(r.ad_refills ?? 0), 0);
const 광고본사람 = new Set(rows.filter((r) => Number(r.ad_refills ?? 0) > 0).map((r) => r.user_id));
const 턴합 = rows.reduce((a, r) => a + r.turns, 0);

/** 한 사람이 며칠이나 닿았나 — 한 번 닿은 사람과 매일 닿는 사람은 다른 사람이다. */
const 사람별닿음 = new Map<string, number>();
for (const r of 닿은날) 사람별닿음.set(r.user_id, (사람별닿음.get(r.user_id) ?? 0) + 1);
const 자주 = [...사람별닿음.values()].filter((n) => n >= 3).length;

const pct = (a: number, b: number) => (b === 0 ? "—" : `${((a / b) * 100).toFixed(1)}%`);

console.log(`\n=== 광고를 볼 사람 (최근 ${날수}일, ${부터}부터) ===`);
console.log(`  무료 한도 ${FREE_TURNS_PER_DAY}회 · 광고 하루 ${AD_REFILLS_PER_DAY}번 · 한 번에 +${AD_REFILL_TURNS}`);
console.log(`  · 쓴 날 ${rows.length}일 · 사람 ${사람.size}명 · 턴 ${턴합}회`);
console.log(`  · **한도에 닿은 날 ${닿은날.length}일** (${pct(닿은날.length, rows.length)}) — 한도 카드가 뜬 날`);
console.log(`  · **단추가 보인 날 ${본날.length}일** (${pct(본날.length, rows.length)}) — 하트 ${AD_NUDGE_AT}개 이하까지 내려간 날`);
console.log(`  · **닿은 사람 ${닿은사람.size}명** (${pct(닿은사람.size, 사람.size)}) · 그중 3일 이상 닿은 사람 ${자주}명`);
console.log(`  · 광고 본 횟수 ${광고본횟수}회 · 본 사람 ${광고본사람.size}명 (스위치가 꺼져 있으면 0 이 맞다)`);

/** 붙일 값이 있나 — 노출당 3~7원으로 양쪽을 적는다(한국 보상형 대략값, 내 추정). */
const 하루본다 = 본날.length / 날수;
console.log(`\n  하루 평균 ${하루본다.toFixed(1)}번 단추가 보인다(하트 ${AD_NUDGE_AT}개 이하로 내려간 날).`);
if (본날.length === 0) {
  console.log(`  → **붙여도 0원이다.** 단추까지 내려가는 사람이 없으면 아무도 못 본다.`);
  console.log(`     10-25 와 같은 자리다 — 광고 탓이 아니라 **볼 자리가 없는 것**이다.`);
  console.log(`     자리를 더 당기기 전에 **사람 수**를 먼저 본다: 쓰는 사람이 적으면 어디 둬도 적다.`);
} else {
  const 월최대 = 하루본다 * 30 * AD_REFILLS_PER_DAY;
  console.log(`  → 모두가 매번 ${AD_REFILLS_PER_DAY}번씩 다 본다고 **가장 좋게** 쳐도 월 노출 ${월최대.toFixed(0)}회`);
  console.log(`     = 월 ${(월최대 * 3).toFixed(0)}~${(월최대 * 7).toFixed(0)}원 (노출당 3~7원, **내 추정치다**)`);
  console.log(`     드는 값: 늘어난 턴 ${(월최대 * AD_REFILL_TURNS).toFixed(0)}회 × 0.457원 = ${(월최대 * AD_REFILL_TURNS * 0.457).toFixed(0)}원`);
}
console.log(`\n  못 세는 것: 카드를 **봤는지**는 기록이 없다 — 위 날수는 상한선이다.`);
