/** 100회차: 결제 표가 앱(서비스 키·PostgREST)에서 보이는지 — 새 열과 원장 표. npx tsx engine/tools/rookery_env.mts engine/tools/billing_schema_check.mts */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const svc = createServiceClient();
const a = await svc.from("companies").select("id, billing_mode, credits_started_at").limit(3);
console.log("companies cols:", a.error ? "ERR " + a.error.message : `ok, modes=${(a.data ?? []).map((r) => r.billing_mode).join(",")}`);
const b = await svc.from("credit_ledger").select("id", { count: "exact", head: true });
console.log("credit_ledger:", b.error ? "ERR " + b.error.message : `ok, rows=${b.count}`);
