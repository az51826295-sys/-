/**
 * **두근도트 결제 자** (10-28). 모델 0 · 값 0.
 *   npx tsx engine/work/probe/dot-pay-test.mts
 *   PAY_SABOTAGE=1..5 npx tsx engine/work/probe/dot-pay-test.mts   ← 심은 고장을 잡나
 *
 * 돈이 오가는 자리라 자를 제일 먼저 짓는다. 여기서 틀리면 **공짜로 구독을 주거나
 * 돈만 받고 안 켜 준다.** 둘 다 코드가 조용히 통과하는 종류의 고장이다.
 *
 * 재는 것: 서명 없는 요청을 막나 · 재전송(오래된 서명)을 막나 · 갱신 이벤트를 두 번
 *          세지 않나 · 남의 id 를 지어내도 주나 · 지나간 만료일을 그대로 믿나.
 * 못 재는 것: Dodo 가 진짜로 그 모양의 웹훅을 보내는지(그건 실제 결제 한 번이 필요하다).
 *             그래서 **마지막 확인은 테스트 모드 실결제 한 건**으로 한다.
 */
import { createHmac } from "node:crypto";

const 심기 = process.env.PAY_SABOTAGE ?? "";
const SECRET = "whsec_" + Buffer.from("도트결제시험열쇠-0123456789").toString("base64");
const ENV = {
  DOT_DODO_API_KEY: "test_key",
  DOT_DODO_PRODUCT_MENHERA: "pdt_test_menhera",
  DOT_DODO_WEBHOOK_SECRET: SECRET,
  DOT_DODO_ENV: "test",
};

const pay = await import("../../../src/lib/dot/pay");
const billing = await import("../../../src/lib/billing/dodo");

/* ── 심은 고장. **계산을 망가뜨린다** — 문턱만 흔들면 자가 거의 안 운다(10-28 에 배웠다). ── */
type 계획 = ReturnType<typeof pay.planDotGrant>;
let 서명확인 = (raw: string, h: Parameters<typeof pay.서명확인>[1], now?: number) =>
  pay.서명확인(raw, h, ENV, now);
let planDotGrant = (e: Parameters<typeof pay.planDotGrant>[0], now?: number): 계획 => pay.planDotGrant(e, now);

if (심기 === "1") 서명확인 = () => ({ ok: true });                       // 서명을 안 본다
if (심기 === "2") 서명확인 = (raw, h, _now) => pay.서명확인(raw, h, ENV, Number(h.timestamp)); // 시각을 안 본다(재전송 허용)
if (심기 === "3") planDotGrant = (e, now) => {                            // 아무 이벤트나 센다
  return pay.planDotGrant({ ...e, type: "payment.succeeded" }, now);
};
if (심기 === "4") planDotGrant = (e, now) => {                            // 주인 표시를 안 본다
  const d = e.data ?? {};
  if (e.type !== "payment.succeeded" || !d.payment_id) return { ok: false, 건너뜀: "x" };
  return { ok: true, userId: String(d.metadata?.dot_user ?? "누구든"), days: 32, ref: d.payment_id, 만료: null };
};
if (심기 === "5") planDotGrant = (e, now) => {                            // 지나간 날짜를 그대로 믿는다
  const r = pay.planDotGrant(e, now);
  const d = (e.data ?? {}) as { next_billing_date?: string | null };
  if (r.ok && d.next_billing_date) {
    const ms = Date.parse(d.next_billing_date) - (now ?? Date.now());
    return { ...r, days: Math.ceil(ms / 864e5) };
  }
  return r;
};

let 나쁨 = 0;
const 재기 = (n: string, ok: boolean, 본?: unknown) => {
  if (!ok) 나쁨++;
  console.log((ok ? "통과" : "실패") + " " + n + (본 === undefined ? "" : "  " + JSON.stringify(본)));
};

const 지금 = Date.UTC(2026, 9, 28, 12, 0, 0);
const 지금초 = Math.floor(지금 / 1000);
const 사인 = (body: string, id = "evt_1", ts = 지금초) => ({
  id, timestamp: String(ts), signature: billing.signDodo(body, id, ts, SECRET),
});
const 결제 = (over: Record<string, unknown> = {}) => JSON.stringify({
  type: "payment.succeeded",
  data: {
    payment_id: "pay_abc123",
    status: "succeeded",
    subscription_id: "sub_1",
    metadata: { dot_user: "11111111-2222-3333-4444-555555555555", sku: "menhera_sub" },
    ...over,
  },
});

/* ── ① 서명 ── */
{
  const body = 결제();
  재기("바른 서명은 통과한다", 서명확인(body, 사인(body), 지금초).ok);
  재기("서명이 없으면 막는다", !서명확인(body, { id: null, timestamp: null, signature: null }, 지금초).ok);
  재기("남의 열쇠로 만든 서명은 막는다", !서명확인(body, {
    id: "evt_1", timestamp: String(지금초),
    signature: "v1," + createHmac("sha256", Buffer.from("다른열쇠")).update(`evt_1.${지금초}.${body}`).digest("base64"),
  }, 지금초).ok);
  /* **본문을 한 글자 바꾸면 막아야 한다.** 금액을 바꿔 치기하는 자리다. */
  const 바꾼 = 결제({ total_amount: 1 });
  재기("본문을 바꾸면 막는다", !서명확인(바꾼, 사인(body), 지금초).ok);
  /* 재전송 — 오래된 서명을 받아 주면 한 번 산 사람이 무한히 갱신된다. */
  const 옛 = 지금초 - 3600;
  재기("한 시간 전 서명은 막는다(재전송)", !서명확인(body, 사인(body, "evt_1", 옛), 지금초).ok);
}

/* ── ② 무엇을 셀 것인가 ── */
{
  재기("성공한 결제는 센다", planDotGrant(JSON.parse(결제()), 지금).ok);
  /* **갱신 이벤트를 같이 세면 한 달에 두 번 채운다.** 로키가 같은 자리에서 먼저 배웠다. */
  const 갱신 = JSON.parse(결제()) as Record<string, unknown>;
  갱신.type = "subscription.renewed";
  재기("subscription.renewed 는 안 센다", !planDotGrant(갱신, 지금).ok, planDotGrant(갱신, 지금));
  const 실패 = JSON.parse(결제({ status: "failed" }));
  재기("실패한 결제는 안 센다", !planDotGrant(실패, 지금).ok);
  const 번호없음 = JSON.parse(결제({ payment_id: undefined }));
  재기("결제 번호가 없으면 안 센다", !planDotGrant(번호없음, 지금).ok);
}

/* ── ③ 누구 것인가 ── */
{
  const 주인없음 = JSON.parse(결제({ metadata: { sku: "menhera_sub" } }));
  재기("주인 표시가 없으면 안 준다", !planDotGrant(주인없음, 지금).ok, planDotGrant(주인없음, 지금));
  const 가짜 = JSON.parse(결제({ metadata: { dot_user: "나야나", sku: "menhera_sub" } }));
  재기("id 모양이 아니면 안 준다", !planDotGrant(가짜, 지금).ok, planDotGrant(가짜, 지금));
  const 딴상품 = JSON.parse(결제({ metadata: { dot_user: "11111111-2222-3333-4444-555555555555", sku: "turns_50" } }));
  재기("모르는 상품은 안 준다", !planDotGrant(딴상품, 지금).ok, planDotGrant(딴상품, 지금));
  const 좋은것 = planDotGrant(JSON.parse(결제()), 지금);
  재기("주인 id 를 그대로 옮긴다", 좋은것.ok && 좋은것.userId === "11111111-2222-3333-4444-555555555555");
  재기("결제 번호를 ref 로 쓴다(두 번 안 주려고)", 좋은것.ok && 좋은것.ref === "pay_abc123");
}

/* ── ④ 며칠을 줄 것인가 ── */
{
  const 앞으로 = new Date(지금 + 30 * 864e5).toISOString();
  const r1 = planDotGrant(JSON.parse(결제({ next_billing_date: 앞으로 })), 지금);
  재기("다음 결제일이 있으면 그 날까지 준다", r1.ok && r1.days === 30, r1.ok ? r1.days : r1);
  const r2 = planDotGrant(JSON.parse(결제()), 지금);
  재기("다음 결제일이 없으면 32일을 준다", r2.ok && r2.days === pay.FALLBACK_DAYS, r2.ok ? r2.days : r2);
  /* **지나간 날짜를 그대로 믿으면 산 사람이 0일을 받는다.** 돈만 받는 고장이다. */
  const 지난 = new Date(지금 - 5 * 864e5).toISOString();
  const r3 = planDotGrant(JSON.parse(결제({ next_billing_date: 지난 })), 지금);
  재기("지나간 날짜는 안 믿는다", r3.ok && r3.days >= 1, r3.ok ? r3.days : r3);
  재기("어떤 경우에도 0일을 주지 않는다",
    [r1, r2, r3].every((r) => r.ok && r.days >= 1));
}

/* ── ⑤ 막는 것을 사람 말로 세는가 ── */
{
  const 다있음 = pay.payState({ signedIn: true }, ENV);
  재기("다 갖춰지면 열린다", 다있음.열림 && 다있음.막는것.length === 0, 다있음);
  const 로그인없음 = pay.payState({ signedIn: false }, ENV);
  재기("계정이 없으면 막고 그 까닭을 적는다",
    !로그인없음.열림 && 로그인없음.막는것.some((m) => m.includes("계정")), 로그인없음.막는것);
  const 열쇠없음 = pay.payState({ signedIn: true }, { ...ENV, DOT_DODO_API_KEY: undefined });
  재기("열쇠가 없으면 막고 그 까닭을 적는다",
    !열쇠없음.열림 && 열쇠없음.막는것.some((m) => m.includes("열쇠")), 열쇠없음.막는것);
  const 상품없음 = pay.payState({ signedIn: true }, { ...ENV, DOT_DODO_PRODUCT_MENHERA: undefined });
  재기("상품이 없으면 막는다", !상품없음.열림);
  재기("값은 상품표에서 온다(화면에 박지 않는다)", 다있음.상품.price === "월 4,900원", 다있음.상품);
}

/* ── ⑥ 결제창을 못 만들면 링크를 지어내지 않는가 ── */
{
  const 거절 = await pay.createDotCheckout(
    { userId: "u", email: null, returnUrl: "https://x/y" }, ENV,
    (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch);
  재기("Dodo 가 거절하면 링크를 안 지어낸다", !거절.ok);
  const 빈링크 = await pay.createDotCheckout(
    { userId: "u", email: null, returnUrl: "https://x/y" }, ENV,
    (async () => Response.json({ subscription_id: "sub_1" })) as unknown as typeof fetch);
  재기("링크가 안 오면 성공이라 하지 않는다", !빈링크.ok, 빈링크);
  let 보낸것: Record<string, unknown> = {};
  const 좋은 = await pay.createDotCheckout(
    { userId: "11111111-2222-3333-4444-555555555555", email: "a@b.c", returnUrl: "https://x/y" }, ENV,
    (async (_u: string, init: RequestInit) => {
      보낸것 = JSON.parse(String(init.body)) as Record<string, unknown>;
      return Response.json({ payment_link: "https://test.dodopayments.com/c/abc" });
    }) as unknown as typeof fetch);
  재기("링크를 받으면 그대로 돌려준다", 좋은.ok);
  /* **주인 표시를 서버가 넣는가.** 이게 없으면 웹훅이 누구에게 줄지 모른다. */
  재기("결제창에 주인 id 를 서버가 넣는다",
    (보낸것.metadata as Record<string, string>)?.dot_user === "11111111-2222-3333-4444-555555555555",
    보낸것.metadata);
  재기("상품 id 는 환경변수에서 온다",
    보낸것.product_id === ENV.DOT_DODO_PRODUCT_MENHERA, 보낸것.product_id);
}

console.log(나쁨 === 0 ? "\n전부 통과" : `\n${나쁨}개 실패`);
process.exit(나쁨 === 0 ? 0 : 1);
