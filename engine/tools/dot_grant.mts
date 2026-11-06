/**
 * 손 결제 — 스토어가 붙기 전에 사장님이 상품을 준다(09-11).
 *
 *   npx tsx engine/tools/dot_grant.mts <이메일> <sku>        sku: turns_50 | turns_200 | menhera_30
 *   npx tsx engine/tools/dot_grant.mts <이메일> --revoke-menhera
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) { const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0,i).trim()] = l.slice(i+1).trim(); }
const { createServiceClient } = await import("../../src/lib/supabase/service");
/* 11-06: 파는 상품(`SKUS`)을 없앴다. 손으로 줄 때는 **무엇을 얼마나** 줄지 여기서 직접 적는다.
   지금 줄 수 있는 것은 멘헤라 자격 30일(`menhera`)과 크레딧(`credits:<수>`) 둘이다. */
const [email, skuKey] = process.argv.slice(2);
if (!email || !skuKey) { console.error("사용: dot_grant.mts <이메일> <menhera|credits:수|--revoke-menhera>"); process.exit(1); }
const db = createServiceClient();
const { data: list } = await db.auth.admin.listUsers();
const u = list?.users.find((x) => x.email?.toLowerCase() === email.toLowerCase());
if (!u) { console.error("그런 사람 없음:", email); process.exit(1); }
if (skuKey === "--revoke-menhera") {
  await db.from("dot_entitlements").upsert({ user_id: u.id, menhera_until: null, updated_at: new Date().toISOString() });
  await db.from("dot_bonds").update({ mode: "normal" }).eq("user_id", u.id);
  console.log(`${email} → 멘헤라 거둠(모드도 일반으로)`); process.exit(0);
}
const 크레딧 = skuKey.startsWith("credits:") ? Number(skuKey.slice(8)) : 0;
const 멘헤라일 = skuKey === "menhera" ? 30 : 0;
if (!크레딧 && !멘헤라일) { console.error("줄 것이 없다:", skuKey, "— menhera 또는 credits:<수>"); process.exit(1); }
const { error } = await db.rpc("dot_grant", { p_user: u.id, p_sku: skuKey, p_credits: 크레딧, p_menhera_days: 멘헤라일, p_source: "manual", p_ref: null });
if (error) throw error;
console.log(`${email} → ${멘헤라일 ? `멘헤라 ${멘헤라일}일` : `크레딧 ${크레딧}개`} 줌`);
