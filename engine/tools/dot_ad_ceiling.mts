/**
 * # 광고로 **얼마가 천장인가** — 하트 하나당 광고 하나일 때 (11-11)
 *
 *   SCRATCH=<dotvars 있는 곳> npx tsx engine/tools/dot_ad_ceiling.mts [날수]
 *
 * 사장님: *"하트 하나당 광고 1로 하자고 했잖아."* 맞다 — 그래서 천장은 **광고 자리**가 아니라
 * **사람이 쓰는 하트 수**가 정한다. 한 사람이 말을 한 번 걸 때마다 하트 하나가 나가고,
 * 그 하트를 광고로 채운다면 **말 한 번 = 광고 한 번**이 위쪽 끝이다.
 *
 * ## 왜 자를 새로 만드나 — 옛 자가 **안 보이는 곳**을 셌다
 *
 * `dot_ad_peek` 은 `dot_usage.turns` 를 센다. 그런데 무료 한도가 **0** 이 된 뒤로
 * `dot_take_turn(p_limit=0)` 은 `turns` 를 안 올리고 **지갑(`dot_wallet.credits`)** 에서 뺀다.
 * 즉 장부의 "턴 54회" 는 *"쓴 적이 없다"* 가 아니라 ***"그 칸으로는 안 보인다"*** 일 수 있다
 * ([[zero-can-mean-i-cannot-see]]). 그래서 이 자는 **사람이 실제로 보낸 말**을 센다 —
 * 그건 숨을 곳이 없다.
 *
 * ## 세 수를 같이 적는다 (하나만 적으면 거짓이 된다)
 *
 *  · **쓴 말**        — 30일간 사람이 보낸 말. 하트 하나당 광고면 **이게 천장**이다
 *  · **하루 상한**    — 한 사람 하루 `AD_REFILLS_PER_DAY` 번까지만. 많이 쓰는 사람은 여기서 잘린다
 *  · **내려가는 수**  — 광고를 안 보는 사람(차단기·그냥 안 누름). 모르면 100% 로 치고 상한선이라 적는다
 */
import { readFileSync } from "node:fs";

const 날수 = Number(process.argv[2] ?? 30);
const vars = JSON.parse(readFileSync(process.env.SCRATCH + "/dotvars.json", "utf8")) as Record<string, string>;
process.env.NEXT_PUBLIC_SUPABASE_URL = vars.NEXT_PUBLIC_SUPABASE_URL;
process.env.SUPABASE_SECRET_KEY = vars.SUPABASE_SECRET_KEY;

const { createServiceClient } = await import("../../src/lib/supabase/service");
const { AD_REFILLS_PER_DAY, AD_REFILL_TURNS } = await import("../../src/lib/dot/money");
const db = createServiceClient();

const 부터 = new Date(Date.now() - 날수 * 86_400_000);
const 부터ISO = 부터.toISOString();

/* 사람이 보낸 말만 — 캐릭터 답은 하트를 안 쓴다. */
type Msg = { user_id: string; created_at: string };
const 말: Msg[] = [];
for (let 쪽 = 0; 쪽 < 40; 쪽++) {
  const { data, error } = await db
    .from("dot_messages").select("user_id, created_at")
    .eq("role", "user").gte("created_at", 부터ISO)
    .order("created_at", { ascending: true })
    .range(쪽 * 1000, 쪽 * 1000 + 999);
  if (error) { console.log(`  ❌ 못 셌다: ${error.message}`); process.exit(1); }
  말.push(...((data ?? []) as Msg[]));
  if ((data ?? []).length < 1000) break;
}

const 날 = (s: string) => s.slice(0, 10);
const 사람 = new Set(말.map((m) => m.user_id));
/** 사람×날 로 묶는다 — 하루 상한이 사람마다 따로 걸리기 때문이다. */
const 칸 = new Map<string, number>();
for (const m of 말) { const k = `${m.user_id}|${날(m.created_at)}`; 칸.set(k, (칸.get(k) ?? 0) + 1); }

const 쓴말 = 말.length;
const 상한적용 = [...칸.values()].reduce((a, n) => a + Math.min(n, AD_REFILLS_PER_DAY * AD_REFILL_TURNS), 0);
const 잘린말 = 쓴말 - 상한적용;

console.log(`\n=== 광고 천장 (최근 ${날수}일, ${부터ISO.slice(0, 10)}부터) ===`);
console.log(`  규칙: 하트 1개 = 광고 1번 · 한 사람 하루 ${AD_REFILLS_PER_DAY}번까지\n`);
console.log(`  · 사람이 보낸 말 **${쓴말.toLocaleString()}번** · 사람 **${사람.size}명** · 쓴 날(사람×날) ${칸.size}칸`);
console.log(`  · 한 사람 하루 평균 ${(쓴말 / Math.max(1, 칸.size)).toFixed(1)}번`);
console.log(`  · 하루 상한에 잘리는 말 ${잘린말.toLocaleString()}번 → **광고로 바꿀 수 있는 최대 ${상한적용.toLocaleString()}번**`);

/* 노출당 값은 **내 추정**이다 — 진짜 광고가 붙은 적이 없어 실측이 없다. */
for (const [이름, 값] of [["짜게", 3], ["중간", 5], ["후하게", 7]] as const) {
  const 달 = (상한적용 / 날수) * 30 * 값;
  console.log(`  · ${이름}(노출당 ${값}원): 월 **${Math.round(달).toLocaleString()}원**`);
}
const 원가 = 상한적용 * 0.457;
console.log(`\n  드는 값: 광고로 늘어난 말 ${상한적용}번 × 0.457원 = ${Math.round(원가).toLocaleString()}원`);

/* 거꾸로도 적는다 — "얼마 벌려면 사람이 몇이어야 하나" 가 진짜 묻는 것이다. */
const 사람당월 = (상한적용 / 날수) * 30 / Math.max(1, 사람.size);
console.log(`\n  한 사람이 한 달에 광고 ${사람당월.toFixed(1)}번 → 노출당 5원이면 **1인당 월 ${(사람당월 * 5).toFixed(0)}원**`);
for (const 목표 of [10_000, 100_000]) {
  console.log(`  → 월 ${목표.toLocaleString()}원 벌려면 **${Math.round(목표 / Math.max(0.01, 사람당월 * 5)).toLocaleString()}명**`);
}
console.log(`\n  이 수는 **상한선**이다: 광고를 100% 다 본다고 쳤다(차단기·안 누름 0명).`);
