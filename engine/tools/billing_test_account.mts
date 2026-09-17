/**
 * 결제 시험용 계정 (100회차 09-13) — 사장님이 InPrivate 창에서 테스트 카드로 결제해 볼 충전식 계정 + 1회용 로그인 링크.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/billing_test_account.mts            → 만들고 링크를 찍는다
 *   npx tsx engine/tools/rookery_env.mts engine/tools/billing_test_account.mts --delete <uid>
 * 사장님 평소 브라우저 세션을 건드리지 않게 **InPrivate 창**에서 열 것. 시험이 끝나면 지운다(원장까지 cascade).
 */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { startPrepaid } = await import("../../src/lib/billing/ledger");
const svc = createServiceClient();
const BASE = "https://rookery-web-production.up.railway.app";
if (process.argv[2] === "--delete") { await svc.auth.admin.deleteUser(process.argv[3]); console.log("지움", process.argv[3]); process.exit(0); }
const email = `pay-test-${Date.now()}@rookery.local`;
const { data: made, error } = await svc.auth.admin.createUser({ email, password: `pt-${Math.random().toString(36).slice(2)}!`, email_confirm: true });
if (error) throw error;
const co = (await svc.from("companies").insert({ owner_id: made.user.id, name: "결제 시험" }).select("id").single()).data!;
await startPrepaid(svc, co.id);
const { data: link, error: le } = await svc.auth.admin.generateLink({ type: "magiclink", email });
if (le) throw le;
console.log(`uid ${made.user.id}\ncompany ${co.id}\n${BASE}/auth/confirm?token_hash=${link.properties.hashed_token}&type=magiclink`);
