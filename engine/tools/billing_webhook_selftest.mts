/**
 * 실서버 웹훅 자가 시험 (100회차 09-13). 카드 없이, 진짜 서명으로 결제 완료 알림을 흉내 내 원장까지 가는지 본다.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/billing_webhook_selftest.mts
 * 씨앗 계정 → 충전식 시작(체험 $1) → 서명한 **구독** transaction.completed(Starter $3/월) → 200 granted →
 * 같은 거래 다시 → duplicate(두 번 안 쌓임, 기간도 다시 안 열림) → 틀린 서명 → 401 →
 * 잔고 = $3 = 300 크레딧(구독이 새 달을 열어 체험 잔량은 넘어가지 않음) → 씨앗 계정 지움(원장까지 cascade).
 * 웹훅 비밀은 %LOCALAPPDATA%\rookery-dot\paddle.json 에서 읽고 **찍지 않는다.**
 */
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";

const { createServiceClient } = await import("../../src/lib/supabase/service");
const { startPrepaid, creditBalance } = await import("../../src/lib/billing/ledger");
const BASE = "https://rookery-web-production.up.railway.app";
const keys = JSON.parse(readFileSync(`${process.env.LOCALAPPDATA}/rookery-dot/paddle.json`, "utf8")) as Record<string, string>;
const svc = createServiceClient();

let bad = 0;
const check = (name: string, ok: boolean, got?: unknown) => { if (!ok) bad++; console.log(ok ? "통과" : "실패", name, ok ? "" : JSON.stringify(got)); };

const email = `billing-selftest-${Date.now()}@rookery.local`;
const { data: made, error } = await svc.auth.admin.createUser({ email, password: `st-${Math.random().toString(36).slice(2)}!`, email_confirm: true });
if (error) throw error;
const uid = made.user.id;
try {
  const co = (await svc.from("companies").insert({ owner_id: uid, name: "결제 자가시험" }).select("id").single()).data!;
  await startPrepaid(svc, co.id);

  const txn = `txn_selftest_${Date.now()}`;
  const subId = `sub_selftest_${Date.now()}`;
  const body = JSON.stringify({
    event_id: `evt_selftest_${Date.now()}`,
    event_type: "transaction.completed",
    occurred_at: new Date().toISOString(),
    data: { id: txn, status: "completed", subscription_id: subId, origin: "web", custom_data: { company_id: co.id }, currency_code: "KRW", items: [{ price: { id: keys.priceStarter }, quantity: 1 }], details: { totals: { total: "9900" } } },
  });
  const post = async (sig: string) => {
    const r = await fetch(`${BASE}/api/billing/paddle`, { method: "POST", headers: { "content-type": "application/json", "paddle-signature": sig }, body });
    return { status: r.status, json: (await r.json().catch(() => ({}))) as Record<string, unknown> };
  };
  const sign = (secret: string) => { const ts = Math.floor(Date.now() / 1000); return `ts=${ts};h1=${createHmac("sha256", secret).update(`${ts}:${body}`).digest("hex")}`; };

  const first = await post(sign(keys.webhookSecret));
  check("진짜 서명 → 200 granted", first.status === 200 && first.json.result === "granted", first);
  const again = await post(sign(keys.webhookSecret));
  check("같은 거래 다시 → duplicate", again.status === 200 && again.json.result === "duplicate", again);
  const forged = await post(sign("pdl_ntfset_wrong_secret"));
  check("틀린 비밀로 서명 → 401", forged.status === 401, forged);

  const { data: rows } = await svc.from("credit_ledger").select("kind, delta_usd, ref").eq("company_id", co.id).order("created_at");
  check("원장 2줄(체험 + 구독 1번)", (rows ?? []).length === 2 && (rows ?? []).filter((r) => r.kind === "purchase").length === 1, rows);
  const bal = await creditBalance(svc, co.id, (await svc.from("companies").select("credits_started_at").eq("id", co.id).single()).data!.credits_started_at as string);
  check("잔고 = 이번 달 Starter 300 크레딧(체험 잔량 안 넘어옴)", bal.readable && bal.credits === 300, bal);
} finally {
  await svc.auth.admin.deleteUser(uid);
  console.log("씨앗 계정 지움", uid);
}
console.log(bad ? `실패 ${bad}` : "전부 통과");
process.exitCode = bad ? 1 : 0;
