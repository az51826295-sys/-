/**
 * 손 결제 — 스토어가 붙기 전에 사장님이 상품을 준다(09-11).
 *
 *   npx tsx engine/tools/dot_grant.mts <이메일> <sku>        sku: turns_50 | turns_200 | menhera_30
 *   npx tsx engine/tools/dot_grant.mts <이메일> --revoke-menhera
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) { const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0,i).trim()] = l.slice(i+1).trim(); }
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { SKUS } = await import("../../src/lib/dot/money");
const [email, skuKey] = process.argv.slice(2);
if (!email || !skuKey) { console.error("사용: dot_grant.mts <이메일> <sku|--revoke-menhera>  sku:", Object.keys(SKUS).join(" ")); process.exit(1); }
const db = createServiceClient();
const { data: list } = await db.auth.admin.listUsers();
const u = list?.users.find((x) => x.email?.toLowerCase() === email.toLowerCase());
if (!u) { console.error("그런 사람 없음:", email); process.exit(1); }
if (skuKey === "--revoke-menhera") {
  await db.from("dot_entitlements").upsert({ user_id: u.id, menhera_until: null, updated_at: new Date().toISOString() });
  await db.from("dot_bonds").update({ mode: "normal" }).eq("user_id", u.id);
  console.log(`${email} → 멘헤라 거둠(모드도 일반으로)`); process.exit(0);
}
const sku = SKUS[skuKey]; if (!sku) { console.error("그런 sku 없음:", skuKey); process.exit(1); }
const { error } = await db.rpc("dot_grant", { p_user: u.id, p_sku: skuKey, p_credits: sku.credits, p_menhera_days: sku.menheraDays, p_source: "manual", p_ref: null });
if (error) throw error;
console.log(`${email} → ${sku.name} (${sku.price}) 줌`);
