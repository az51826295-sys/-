/**
 * 충전 자 (100회차 09-13) — 돈이 오가는 순수 함수들을 결정적으로 잰다. DB·네트워크 없음.
 *   npx tsx engine/tools/billing_probe.mts
 * 서명(맞음·본문 변조·비밀 틀림·오래됨·형식 틀림), 거래→원장 한 줄(정상·수량 2·다른 이벤트·모르는 가격·회사 없음·상품 2개),
 * 잔고 계산(음수는 0 크레딧), 파는 상품(가격 id 없는 건 안 판다).
 */
import { createHmac } from "node:crypto";
import { verifyPaddleSignature, planGrant, type PaddleEvent } from "../../src/lib/billing/paddle";
import { balanceFrom } from "../../src/lib/billing/ledger";
import { sellableSkus, toCredits } from "../../src/lib/billing/plans";

let bad = 0;
const check = (name: string, ok: boolean, got?: unknown) => { if (!ok) bad++; console.log(ok ? "통과" : "실패", name, ok ? "" : JSON.stringify(got)); };

const secret = "pdl_ntfset_test_secret";
const now = 1_760_000_000;
const body = JSON.stringify({ event_type: "transaction.completed", data: { id: "txn_1" } });
const sign = (b: string, ts: number, key = secret) => `ts=${ts};h1=${createHmac("sha256", key).update(`${ts}:${b}`).digest("hex")}`;

check("서명 맞음", verifyPaddleSignature(body, sign(body, now), secret, now).ok);
check("본문 한 글자 변조", !verifyPaddleSignature(body.replace("txn_1", "txn_2"), sign(body, now), secret, now).ok);
check("비밀 틀림", !verifyPaddleSignature(body, sign(body, now, "other"), secret, now).ok);
check("10분 전 서명", !verifyPaddleSignature(body, sign(body, now - 600), secret, now).ok);
check("4분 전 서명은 받음", verifyPaddleSignature(body, sign(body, now - 240), secret, now).ok);
check("헤더 없음", !verifyPaddleSignature(body, null, secret, now).ok);
check("형식 틀림", !verifyPaddleSignature(body, "ts=abc;h1=zz", secret, now).ok);
check("비밀 미설정이면 거부", !verifyPaddleSignature(body, sign(body, now), "", now).ok);

const env = { PADDLE_PRICE_STARTER: "pri_300", PADDLE_PRICE_PRO: "pri_1000" };
const co = "11111111-2222-3333-4444-555555555555";
const ev = (over: Partial<NonNullable<PaddleEvent["data"]>> = {}, type = "transaction.completed"): PaddleEvent => ({
  event_type: type,
  data: { id: "txn_abc", status: "completed", custom_data: { company_id: co }, currency_code: "KRW", items: [{ price: { id: "pri_300" }, quantity: 1 }], details: { totals: { total: "9900" } }, ...over },
});
const p1 = planGrant(ev(), env);
check("정상 → $3 원장", "deltaUsd" in p1 && p1.deltaUsd === 3 && p1.ref === "txn_abc" && p1.companyId === co, p1);
const p2 = planGrant(ev({ items: [{ price: { id: "pri_1000" }, quantity: 2 }] }), env);
check("큰 상품 2개 → $20", "deltaUsd" in p2 && p2.deltaUsd === 20, p2);
check("다른 이벤트는 건너뜀", "skip" in planGrant(ev({}, "transaction.updated"), env));
check("모르는 가격은 건너뜀", "skip" in planGrant(ev({ items: [{ price: { id: "pri_evil" }, quantity: 1 }] }), env));
check("회사 표시 없으면 건너뜀", "skip" in planGrant(ev({ custom_data: null }), env));
check("회사 표시가 uuid 아니면 건너뜀", "skip" in planGrant(ev({ custom_data: { company_id: "x' or 1=1" } }), env));
check("상품 2종은 건너뜀", "skip" in planGrant(ev({ items: [{ price: { id: "pri_300" } }, { price: { id: "pri_1000" } }] }), env));
check("가격 설정이 없으면 모든 가격을 모름", "skip" in planGrant(ev(), {}));

check("잔고 $3 − $0.34 = 266 크레딧", balanceFrom(3, 0.34).credits === 266, balanceFrom(3, 0.34));
check("초과 사용은 0 크레딧(음수 표시 안 함)", balanceFrom(1, 1.5).credits === 0 && balanceFrom(1, 1.5).usd < 0, balanceFrom(1, 1.5));
check("크레딧 환산 $10 = 1000", toCredits(10) === 1000);
check("가격 id 없는 상품은 안 판다", sellableSkus({ PADDLE_PRICE_STARTER: "pri_300" }).length === 1 && sellableSkus({}).length === 0);
// 09-13 월 구독: 구독에서 나온 결제(첫 결제·갱신)는 구독 id 를 싣고 → 원장이 새 달을 연다. 1회 결제는 null.
const sub = planGrant(ev({ subscription_id: "sub_123", origin: "subscription_recurring" }), env);
check("구독 갱신 → subscriptionId 실림", "subscriptionId" in sub && sub.subscriptionId === "sub_123", sub);
const once = planGrant(ev(), env);
check("구독 아닌 결제 → subscriptionId null", "subscriptionId" in once && once.subscriptionId === null, once);
check("빈 문자열 구독 id 는 null", (() => { const x = planGrant(ev({ subscription_id: "" }), env); return "subscriptionId" in x && x.subscriptionId === null; })());

console.log(bad ? `실패 ${bad}` : "전부 통과");
process.exitCode = bad ? 1 : 0;
