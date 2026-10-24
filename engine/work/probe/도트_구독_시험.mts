/**
 * **구독 모델이 실제로 도나** (10-25). 모델 0 · 값 0.
 *   npx tsx engine/work/probe/도트_구독_시험.mts
 *
 * 새 DB 에 계정이 0개라 진짜 왕복은 못 돈다(계정 만들기가 내 권한에서 막힌다).
 * 그래서 **제품 코드를 그대로 불러** 가짜 DB 를 끼워 셈만 잰다 —
 * 자가 제 목록을 들고 있으면 금세 낡으니 `balanceFor` 를 직접 import 한다.
 *
 * 못 잰 것도 적는다: `dot_take_turn` 이 한도에서 0 을 돌려주는지는 **계정이 생긴 뒤에** 재야 한다.
 */
import { balanceFor, SKUS, SUB_DAILY_RAIL, LIMIT_COPY } from "@/lib/dot/money";
import { FREE_TURNS_PER_DAY } from "@/lib/dot/bond";

let 나쁨 = 0;
const 재기 = (n: string, ok: boolean, 본?: unknown) => {
  if (!ok) 나쁨++;
  console.log((ok ? "통과" : "실패") + " " + n + (본 === undefined ? "" : "  " + JSON.stringify(본)));
};

/** 표 세 개만 돌려주는 가짜 DB — `balanceFor` 가 부르는 모양에 맞춘다 */
const 가짜DB = (usage: unknown, wallet: unknown, ent: unknown) => ({
  from(표: string) {
    const 값 = 표 === "dot_usage" ? usage : 표 === "dot_wallet" ? wallet : ent;
    const 끝 = { maybeSingle: async () => ({ data: 값 }) };
    const 체인 = { select: () => 체인, eq: () => 체인, ...끝 };
    return 체인 as never;
  },
}) as never;

const 오늘 = "2026-10-25";

/* ── 무료 사용자 ── */
{
  const b = await balanceFor(가짜DB({ turns: 0, bonus_turns: 0, ad_refills: 0 }, null, null), "u", 오늘);
  재기(`무료는 하루 ${FREE_TURNS_PER_DAY}회로 시작한다`, b.remaining === FREE_TURNS_PER_DAY && !b.구독중, { remaining: b.remaining });
}
{
  const b = await balanceFor(가짜DB({ turns: FREE_TURNS_PER_DAY, bonus_turns: 0, ad_refills: 0 }, null, null), "u", 오늘);
  재기("무료는 다 쓰면 0 이 된다", b.remaining === 0 && b.freeLeft === 0, { remaining: b.remaining });
}

/* ── 구독자 ── */
{
  const b = await balanceFor(가짜DB({ turns: 999, bonus_turns: 0, ad_refills: 0 }, null, { menhera_until: "2099-12-31" }), "u", 오늘);
  재기("구독자는 999회를 써도 안 막힌다", b.remaining === Infinity && b.구독중, { remaining: String(b.remaining), 구독중: b.구독중 });
}
{
  const b = await balanceFor(가짜DB({ turns: 0, bonus_turns: 0, ad_refills: 0 }, null, { menhera_until: 오늘 }), "u", 오늘);
  재기("구독 마지막 날도 구독이다", b.구독중 === true, { until: 오늘 });
}
{
  const b = await balanceFor(가짜DB({ turns: 0, bonus_turns: 0, ad_refills: 0 }, null, { menhera_until: "2020-01-01" }), "u", 오늘);
  재기("끝난 구독은 구독이 아니다", b.구독중 === false && b.remaining === FREE_TURNS_PER_DAY, { remaining: b.remaining });
}

/* ── 광고는 사라졌나 ── */
{
  const b = await balanceFor(가짜DB(null, null, null), "u", 오늘);
  재기("광고 칸은 늘 0 이다", b.adLeft === 0, { adLeft: b.adLeft });
}

/* ── 파는 것 ── */
재기("파는 상품은 하나다", Object.keys(SKUS).length === 1, { 상품: Object.keys(SKUS) });
재기("그 하나는 구독이다", SKUS.menhera_sub?.구독 === true, { sku: SKUS.menhera_sub });
재기("옛 턴 상품은 지워졌다", !SKUS.turns_50 && !SKUS.turns_200 && !SKUS.menhera_30, {});

/* ── 난간 ── */
재기("난간은 월 본전 턴 수와 같다(하루 358)", SUB_DAILY_RAIL === 358, { 난간: SUB_DAILY_RAIL });

/* ── 한도 문구 ── */
재기("한도 문구가 결제로 이어진다", LIMIT_COPY.단추.includes("구독") && LIMIT_COPY.본문.length > 10, { 단추: LIMIT_COPY.단추 });

console.log("\n못 잰 것: `dot_take_turn` 이 한도에서 0 을 돌려주는지 — **새 DB 에 계정이 0개라 못 돈다.**");
console.log("           계정이 생기면(복원.sql) 바로 재야 한다. 지금 통과는 **셈만** 맞다는 뜻이다.");
console.log(나쁨 ? `\n**${나쁨}개 실패**` : "\n전부 통과");
process.exit(나쁨 ? 1 : 0);
