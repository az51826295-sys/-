/**
 * 크레딧 손으로 주기·되돌리기 (100회차 09-13) — 운영자 도구. 웹훅이 못 준 결제, 환불, 사과 크레딧.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/billing_grant.mts <companyId> <usd> <grant|refund> "<메모>" [ref]
 *   npx tsx engine/tools/rookery_env.mts engine/tools/billing_grant.mts --show <companyId>
 * 원장은 지우지 않는다 — 환불은 음수 한 줄. ref 를 주면(예: Paddle txn_…) 같은 건이 두 번 들어가지 않는다.
 */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { creditBalance } = await import("../../src/lib/billing/ledger");
const svc = createServiceClient();
const [a, b, c, d, e] = process.argv.slice(2);

if (a === "--show") {
  const { data: co } = await svc.from("companies").select("id, name, billing_mode, credits_started_at").eq("id", b).maybeSingle();
  if (!co) { console.error("회사 없음"); process.exit(1); }
  const bal = await creditBalance(svc, co.id as string, (co.credits_started_at as string | null) ?? null);
  const { data: rows } = await svc.from("credit_ledger").select("created_at, kind, delta_usd, sku, ref, note").eq("company_id", b).order("created_at");
  console.log(co.name, co.billing_mode, bal);
  for (const r of rows ?? []) console.log(r.created_at, r.kind, r.delta_usd, r.sku ?? "", r.ref ?? "", r.note ?? "");
  process.exit(0);
}

const usd = Number(b);
if (!a || !Number.isFinite(usd) || usd <= 0 || (c !== "grant" && c !== "refund") || !d) {
  console.error('사용: <companyId> <usd(양수)> <grant|refund> "<메모>" [ref]');
  process.exit(1);
}
const { error } = await svc.from("credit_ledger").insert({ company_id: a, delta_usd: c === "refund" ? -usd : usd, kind: c, note: d, ref: e ?? null, provider: e?.startsWith("txn_") ? "paddle" : null });
if (error) { console.error(error.code === "23505" ? "이미 들어간 ref" : error.message); process.exit(1); }
console.log(c === "refund" ? "되돌림" : "줌", a, usd);
