/** 광고 촬영용 계정 — 진짜 제품을 진짜로 돌린 화면을 찍는다. 지어낸 화면은 안 쓴다. */
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const email = "demo-rookery@rookery.local";
const password = "Rookery-Demo-2026!aA";
const { data: users } = await db.auth.admin.listUsers({ perPage: 200 });
let u = (users?.users ?? []).find((x) => x.email === email);
if (!u) {
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) { console.error(error.message); process.exit(1); }
  u = data.user;
}
console.log("계정", email);
console.log("비번", password);
console.log("uid", u!.id);
const { data: co } = await db.from("companies").select("id").eq("owner_id", u!.id).maybeSingle();
console.log("회사", co ? (co as any).id : "(첫 대화 때 생김)");
