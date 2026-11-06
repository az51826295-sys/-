/**
 * 광고 보고 +1회 — **진짜 DB 에서 끝까지 돌려 본다** (11-04 사장님 "광고 보면 1개 늘려주는 식으로").
 *
 *   npx tsx engine/tools/dot_ad_test.mts
 *   npx tsx engine/tools/dot_ad_test.mts --sabotage    # 자가 눈이 있나 확인
 *
 * 왜 이 자를 새로 짓나: 있던 `dot_money_test.mts` 는 **못 돈다.** 지금 없는 상품(`turns_50`)을
 * 부르고, 무료 30회·광고 +10 을 기대하고, 로키 `.env.local` 을 읽는다 — 두근도트는 10-24 에
 * 자기 조직으로 이사했다([[dot-moved-to-own-org]]). 옛 자를 고치는 대신 **지금 제품을 재는 자**를 짓는다.
 *
 * 숫자는 **제품에서 import 한다.** 자에 10·5·1 을 베껴 적으면 상수를 바꾼 날 자가 거짓으로 통과한다.
 *
 * ## --sabotage
 *
 * 통과만 보면 자가 눈이 멀었는지 알 수 없다([[ruler-must-catch-a-reproduced-bug]]).
 * 이 스위치는 **진짜 있을 수 있는 고장 둘**을 심는다:
 *   (가) 한 번에 +10 을 준다 (`AD_REFILL_TURNS` 를 잘못 둔 경우)
 *   (나) 하루 상한을 안 센다 (`AD_REFILLS_PER_DAY` 가 안 먹는 경우 — 공짜 무한)
 * 심으면 **반드시 빨간 줄이 나와야** 한다. 초록이면 자를 못 쓴다.
 */
import { readFileSync } from "node:fs";

const 심기 = process.argv.includes("--sabotage");

/** 두근도트 전용 Supabase. 로키 `.env.local` 이 아니다 — 섞으면 다른 DB 를 재게 된다. */
const vars = JSON.parse(readFileSync(process.env.SCRATCH + "/dotvars.json", "utf8")) as Record<string, string>;
process.env.NEXT_PUBLIC_SUPABASE_URL = vars.NEXT_PUBLIC_SUPABASE_URL;
process.env.SUPABASE_SECRET_KEY = vars.SUPABASE_SECRET_KEY;

const { createServiceClient } = await import("../../src/lib/supabase/service");
const { balanceFor, AD_REFILLS_PER_DAY, AD_REFILL_TURNS } = await import("../../src/lib/dot/money");
const { AUTO_HEARTS_PER_DAY } = await import("../../src/lib/dot/bond");

const db = createServiceClient();
const day = "2026-01-02";   // 오늘과 안 겹치는 날. 다른 자·진짜 사용자와 섞이지 않게.

const { data: made, error: eu } = await db.auth.admin.createUser({
  email: `ad-test-${Date.now()}@dugeun.local`, password: "ad-test-pass-1", email_confirm: true,
});
if (eu) throw eu;
const uid = made.user.id;

/** 한 턴 쓰기. 돌아오는 값은 **몇 번째 턴인가**, 막히면 0. */
const take = async () => Number((await db.rpc("dot_take_turn", { p_user: uid, p_day: day, p_limit: AUTO_HEARTS_PER_DAY })).data ?? 0);
/** 광고 한 번. 돌아오는 값은 **오늘 남은 광고 수**, 이미 다 봤으면 -1. */
const ad = async () => Number((await db.rpc("dot_ad_refill", {
  p_user: uid, p_day: day,
  p_max: 심기 ? 99 : AD_REFILLS_PER_DAY,          // (나) 상한을 안 센다
  p_turns: 심기 ? 10 : AD_REFILL_TURNS,           // (가) 한 번에 +10
})).data);
const bal = () => balanceFor(db, uid, day);

const 줄: [boolean, string][] = [];
const 재다 = (ok: boolean, s: string) => 줄.push([ok, s]);

try {
  // (1) 무료분 — 다 쓰면 그다음은 막힌다
  for (let i = 0; i < AUTO_HEARTS_PER_DAY; i++) await take();
  const 넘김 = await take();
  재다(넘김 === 0, `무료 ${AUTO_HEARTS_PER_DAY}회 뒤 다음 턴 = ${넘김} (0 이어야)`);

  const b0 = await bal();
  재다(b0.freeLeft === 0 && b0.remaining === 0 && b0.adLeft === AD_REFILLS_PER_DAY,
    `막힌 자리 잔고: 남은 ${b0.remaining}(0) 공짜 ${b0.freeLeft}(0) 광고 ${b0.adLeft}(${AD_REFILLS_PER_DAY})`);

  // (2) 광고 한 번 → 딱 한 번 더. **+1 인지 재는 것이 핵심이다.**
  const 남음1 = await ad();
  const b1 = await bal();
  재다(남음1 === AD_REFILLS_PER_DAY - 1 && b1.adLeft === AD_REFILLS_PER_DAY - 1,
    `광고 1번 → 남은 광고 ${남음1}·잔고도 ${b1.adLeft} (${AD_REFILLS_PER_DAY - 1})`);
  재다(b1.remaining === AD_REFILL_TURNS, `광고 1번이 준 횟수 = ${b1.remaining} (${AD_REFILL_TURNS})`);

  const 쓴것: number[] = [];
  for (let i = 0; i < AD_REFILL_TURNS; i++) 쓴것.push(await take());
  const 또넘김 = await take();
  재다(또넘김 === 0 && 쓴것.every((n) => n > 0),
    `받은 ${AD_REFILL_TURNS}회를 쓰면 다시 막힌다 — 쓴 턴 ${쓴것.join(",")}, 그다음 ${또넘김} (0)`);

  // (3) 하루 상한 — 다 보면 더 못 본다
  for (let i = 1; i < AD_REFILLS_PER_DAY; i++) await ad();
  const 마지막 = await bal();
  재다(마지막.adLeft === 0, `광고 ${AD_REFILLS_PER_DAY}번 다 보면 남은 광고 ${마지막.adLeft} (0)`);
  const 더 = await ad();
  재다(더 === -1, `${AD_REFILLS_PER_DAY + 1}번째 광고 = ${더} (-1 이어야)`);

  // (4) 하루 최대치 — 무료 + 광고. **사장님에게 보일 숫자가 이것이다.**
  let 총 = AUTO_HEARTS_PER_DAY + AD_REFILL_TURNS;   // 여기까지 이미 쓴 턴
  while ((await take()) > 0) 총++;
  const 기대 = AUTO_HEARTS_PER_DAY + AD_REFILLS_PER_DAY * AD_REFILL_TURNS;
  재다(총 === 기대, `하루 최대 = ${총}회 (무료 ${AUTO_HEARTS_PER_DAY} + 광고 ${AD_REFILLS_PER_DAY}×${AD_REFILL_TURNS} = ${기대})`);

  // (5) 두 번 세지 않나 — 광고분이 bonus_turns 에도, 따로도 더해지면 여기서 어긋난다
  const b2 = await bal();
  재다(b2.remaining === b2.freeLeft + b2.credits,
    `남은 ${b2.remaining} = 공짜 ${b2.freeLeft} + 충전 ${b2.credits} (광고분 중복 없음)`);

  /* (6) 11-06: 구독이 없어졌다. 자격(멘헤라)을 가진 사람도 **하트를 똑같이 쓰고 광고를 본다** —
     무제한이 사라졌으니 여기서 볼 것은 "자격이 한도를 뚫지 않는다" 이다. */
  await db.rpc("dot_grant", { p_user: uid, p_sku: "menhera", p_credits: 0, p_menhera_days: 30, p_source: "manual", p_ref: null });
  const b3 = await bal();
  재다(Number.isFinite(b3.remaining) && !!b3.menheraUntil,
    `멘헤라 자격자도 한도 안: 남은 ${b3.remaining}(유한해야) · 자격 ${b3.menheraUntil ? "있음" : "없음"}`);
} finally {
  await db.auth.admin.deleteUser(uid).catch(() => {});
  await db.from("dot_usage").delete().eq("user_id", uid);
  await db.from("dot_purchases").delete().eq("user_id", uid);
}

for (const [ok, s] of 줄) console.log(`  ${ok ? "✅" : "❌"} ${s}`);
const 모두 = 줄.every(([ok]) => ok);
if (심기) {
  console.log(모두
    ? "❌ 고장을 심었는데 전부 통과했다 — **이 자는 눈이 멀었다.**"
    : `✅ 심은 고장을 잡았다 (${줄.filter(([ok]) => !ok).length}줄 빨강) — 자가 보고 있다.`);
  process.exit(모두 ? 1 : 0);
}
console.log(모두 ? "모두 통과" : "떨어진 줄 있음");
process.exit(모두 ? 0 : 1);
