/** 개발 계정 한 번 쓰는 로그인 링크 (222회차). 비밀번호가 없는 계정이라 이 링크로 들어간다. 만든 뒤 한 시간·한 번만.
 *  npx tsx engine/tools/rookery_env.mts engine/tools/dev_login.mts */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { account } = await import("./company.mjs");
const BASE = process.env.ROOKERY_DEV_WEB ?? "https://rookery-web-dev-production.up.railway.app";
const { data: link, error } = await createServiceClient().auth.admin.generateLink({ type: "magiclink", email: account().ownerEmail });
if (error) throw error;
console.log(`${account().label}(${account().ownerEmail}) 로그인 링크 — 한 번만, 곧 만료:`);
console.log(`${BASE}/auth/confirm?token_hash=${link.properties.hashed_token}&type=magiclink`);
