// 11-27 사장님 계정에 시험 토큰 넣기(사장님 "넣어줘") — sku pixel_free · ref grant:<id>:1127 (판매 줄 pixel_10 과 섞지 않는다)
//   npx tsx grant_owner.mts <이메일> <토큰> [--go]
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(/\r?\n/)) { const i = l.indexOf("="); if (i > 0 && /^[A-Z_]+$/.test(l.slice(0, i))) process.env[l.slice(0, i)] ??= l.slice(i + 1).replace(/^"|"$/g, ""); }
const { createClient } = await import("@supabase/supabase-js");
const { pixelBalance } = await import("../../../../src/lib/pixel/credits");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const [email, n, go] = process.argv.slice(2);
const hits: { id: string; created_at: string; last_sign_in_at?: string; providers: string }[] = [];
for (let page = 1; ; page++) {
  const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw error;
  for (const u of data.users) if ((u.email ?? "").toLowerCase() === email.toLowerCase()) hits.push({ id: u.id, created_at: u.created_at, last_sign_in_at: u.last_sign_in_at, providers: (u.identities ?? []).map((i) => i.provider).join(",") });
  if (data.users.length < 1000) break;
}
for (const h of hits) console.log(`${h.id.slice(0, 8)} 만든 ${h.created_at.slice(0, 10)} 마지막 로그인 ${h.last_sign_in_at?.slice(0, 16) ?? "-"} ${h.providers} · 토큰 ${await pixelBalance(db as never, h.id)}`);
if (hits.length !== 1) { console.log(`계정 ${hits.length}개 — 하나가 아니라 멈춤`); process.exit(1); }
if (go !== "--go") process.exit(0);
const id = hits[0].id;
const { error } = await db.from("dot_purchases").insert({ user_id: id, sku: "pixel_free", credits: Number(n), menhera_days: 0, source: "pixel", ref: `grant:${id}:1127` });
console.log(error ? `실패 ${error.code} ${error.message}` : `넣음 +${n} → 토큰 ${await pixelBalance(db as never, id)}`);
