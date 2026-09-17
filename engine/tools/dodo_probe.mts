/**
 * **Dodo 결제가 원장까지 닿는가** (167회차 09-18).
 *
 *   npx tsx engine/tools/dodo_probe.mts            — 서명·이벤트 → 원장 한 줄(계획)까지. 돈 0, 네트워크 0.
 *   npx tsx engine/tools/dodo_probe.mts --api      — 키 파일(%LOCALAPPDATA%/rookery-dot/dodo.json)로 **시험 서버**에 결제창을 하나 만들어 본다.
 *                                                    돈은 안 움직인다(링크만 생긴다). 키가 맞는지·상품 id 가 맞는지 본다.
 *
 * 고장 재현(늘 같이 돈다): 틀린 비밀 · 본문 한 글자 바뀜 · 6분 전 시각 · 헤더 없음 · 다른 id 로 재전송 → **전부 거부**여야 한다.
 * 그리고 세면 안 되는 것: subscription.renewed(같이 오는 쌍둥이) · 실패한 결제 · 회사 표시 없음 · 모르는 상품.
 */
import { readFileSync, existsSync } from "node:fs";
const { verifyDodoSignature, signDodo, planDodoGrant, createDodoCheckout, dodoSellableSkus } = await import("../../src/lib/billing/dodo");

let bad = 0, seen = 0;
const check = (n: string, ok: boolean, got?: unknown) => { seen++; if (!ok) bad++; console.log(ok ? "맞음  " : "어긋남", n, ok ? "" : JSON.stringify(got)); };

const secret = "whsec_" + Buffer.from("rookery-dodo-probe-secret-32bytes").toString("base64");
const env = { DODO_PRODUCT_STARTER: "pdt_starter_x", DODO_PRODUCT_PRO: "pdt_pro_x" };
const CO = "11111111-2222-4333-8444-555555555555";
const now = 1_800_000_000;
const body = JSON.stringify({ business_id: "bus_x", type: "payment.succeeded", timestamp: "2026-09-18T00:00:00Z", data: { payload_type: "Payment", payment_id: "pay_123", subscription_id: "sub_9", status: "succeeded", total_amount: 9900, currency: "KRW", metadata: { company_id: CO, sku: "starter_monthly" }, product_cart: null } });
const sig = signDodo(body, "msg_1", now, secret);
const H = (o: Partial<{ id: string | null; timestamp: string | null; signature: string | null }> = {}) => ({ id: "msg_1", timestamp: String(now), signature: sig, ...o });

// 내 서명기로 내 검증기를 재면 돌고 도는 시험이다 — Standard Webhooks 문서에 실린 남의 예시로 먼저 잰다.
check("바깥 기준: Standard Webhooks 공개 예시 서명이 통과", verifyDodoSignature('{"test": 2432232314}', { id: "msg_p5jXN8AQM9LWM0D4loKWxJek", timestamp: "1614265330", signature: "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=" }, "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw", 1614265330).ok);
check("맞는 서명은 통과", verifyDodoSignature(body, H(), secret, now).ok);
check("서명이 여러 개 와도(열쇠 교체 중) 하나 맞으면 통과", verifyDodoSignature(body, H({ signature: "v1,AAAA " + sig }), secret, now).ok);
check("고장: 틀린 비밀 → 거부", !verifyDodoSignature(body, H(), "whsec_" + Buffer.from("other").toString("base64"), now).ok);
check("고장: 본문 한 글자(9900→99000) → 거부", !verifyDodoSignature(body.replace("9900", "99000"), H(), secret, now).ok);
check("고장: 6분 전 시각 → 거부", !verifyDodoSignature(body, H(), secret, now + 360).ok);
check("고장: 같은 서명을 다른 id 로 재전송 → 거부", !verifyDodoSignature(body, H({ id: "msg_2" }), secret, now).ok);
check("고장: 헤더 없음 → 거부", !verifyDodoSignature(body, H({ signature: null }), secret, now).ok);
check("고장: 비밀이 비어 있음 → 거부(열린 채 고장 나지 않는다)", !verifyDodoSignature(body, H(), "", now).ok);

const ev = JSON.parse(body);
const never = async () => { throw new Error("묻지 말았어야 한다"); };
const g = await planDodoGrant(ev, env, never);
check("구독 결제(상품 목록 없음) → metadata.sku 로 Starter $3, 구독 id 실림", !("skip" in g) && g.sku.id === "starter_monthly" && g.deltaUsd === 3 && g.subscriptionId === "sub_9" && g.ref === "pay_123" && g.companyId === CO && g.provider === "dodo", g);
const g2 = await planDodoGrant({ ...ev, data: { ...ev.data, metadata: { company_id: CO }, product_cart: [{ product_id: "pdt_pro_x", quantity: 1 }] } }, env, never);
check("상품 목록이 있으면 그것으로 → Pro $10", !("skip" in g2) && g2.sku.id === "pro_monthly" && g2.deltaUsd === 10, g2);
const g3 = await planDodoGrant({ ...ev, data: { ...ev.data, metadata: { company_id: CO } } }, env, async (id) => (id === "sub_9" ? "pdt_pro_x" : null));
check("목록도 표시도 없으면 구독을 물어서 안다", !("skip" in g3) && g3.sku.id === "pro_monthly", g3);
const g4 = await planDodoGrant({ ...ev, data: { ...ev.data, metadata: { company_id: CO, sku: "pro_monthly" }, product_cart: [{ product_id: "pdt_starter_x", quantity: 1 }] } }, env, never);
check("표시(Pro)와 실제 산 것(Starter)이 다르면 **산 것**을 준다", !("skip" in g4) && g4.sku.id === "starter_monthly", g4);
check("안 센다: subscription.renewed(쌍둥이 — 세면 한 달에 두 번 채운다)", "skip" in (await planDodoGrant({ ...ev, type: "subscription.renewed" }, env, never)));
check("안 센다: 실패한 결제", "skip" in (await planDodoGrant({ ...ev, data: { ...ev.data, status: "failed" } }, env, never)));
check("안 센다: 회사 표시 없음", "skip" in (await planDodoGrant({ ...ev, data: { ...ev.data, metadata: {} } }, env, never)));
check("안 센다: 모르는 상품", "skip" in (await planDodoGrant({ ...ev, data: { ...ev.data, metadata: { company_id: CO }, subscription_id: null, product_cart: [{ product_id: "pdt_unknown", quantity: 1 }] } }, env, never)));
check("상품 id 를 안 넣은 요금제는 안 판다", dodoSellableSkus({ DODO_PRODUCT_STARTER: "x" }).length === 1);

// 시험 모드의 문: 시험 카드는 공개돼 있다 — 명단 밖 사람에게 결제창이 열리면 공짜 크레딧이 진짜 모델 값을 쓴다.
const { canCheckout } = await import("../../src/lib/billing/plans");
const T = { BILLING_PROVIDER: "dodo", DODO_ENV: "test", OWNER_EMAIL: "boss@example.com", BILLING_TEST_EMAILS: "demo@rookery.local, qa@example.com", CHECKOUT_OPEN: "1" };
check("시험 모드: 명단에 있는 사람은 열린다(대소문자 무시)", canCheckout("Boss@Example.com", T) && canCheckout("demo@rookery.local", T));
check("고장: 시험 모드인데 CHECKOUT_OPEN=1 이라고 남에게 열리면 안 된다", !canCheckout("stranger@example.com", T));
check("시험 모드: 이메일 없는 사람(익명)에겐 안 열린다", !canCheckout(null, T));
check("라이브: 스위치가 켜지면 모두에게, 꺼지면 아무에게도", canCheckout("stranger@example.com", { ...T, DODO_ENV: "live" }) && !canCheckout("boss@example.com", { ...T, DODO_ENV: "live", CHECKOUT_OPEN: "0" }));

if (process.argv.includes("--api")) {
  const f = `${process.env.LOCALAPPDATA}/rookery-dot/dodo.json`;
  if (!existsSync(f)) { console.log(`\n키 파일이 없다: ${f}`); process.exit(2); }
  const k = JSON.parse(readFileSync(f, "utf8")) as { env?: string; apiKey?: string; webhookSecret?: string; productStarter?: string; productPro?: string };
  const filled = { apiKey: !!k.apiKey, webhookSecret: !!k.webhookSecret, productStarter: !!k.productStarter, productPro: !!k.productPro };
  console.log("\n키 파일:", JSON.stringify(filled), "· 모드", k.env ?? "test");
  check("키 파일 네 칸이 다 찼다", Object.values(filled).every(Boolean), filled);
  if (k.apiKey && k.productStarter) {
    const e = { DODO_ENV: k.env === "live" ? "live" : "test", DODO_API_KEY: k.apiKey, DODO_PRODUCT_STARTER: k.productStarter, DODO_PRODUCT_PRO: k.productPro };
    if (e.DODO_ENV === "live") { console.log("라이브 키로는 이 시험을 안 돌린다."); process.exit(2); }
    const r = await createDodoCheckout({ skuId: "starter_monthly", companyId: CO, email: null, returnUrl: "https://rookery-web-production.up.railway.app/ask?paid=1" }, e);
    check("시험 서버가 결제창 주소를 줬다", r.ok && /^https:\/\//.test(r.url), r.ok ? undefined : r);
    if (r.ok) console.log("   결제창:", r.url);
  }
}

console.log(`\n본 줄 ${seen} · 어긋남 ${bad}`);
process.exit(bad === 0 ? 0 : 1);
