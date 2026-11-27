// 11-27 무료 10토큰을 받은 계정이 누군지(가입 경로·꼬리표·시각) — 사장님 화면 "10토큰" 이 어느 계정인지 가리기(돈 0)
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(/\r?\n/)) { const i = l.indexOf("="); if (i > 0 && /^[A-Z_]+$/.test(l.slice(0, i))) process.env[l.slice(0, i)] ??= l.slice(i + 1).replace(/^"|"$/g, ""); }
const { createClient } = await import("@supabase/supabase-js");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const { data } = await db.from("dot_purchases").select("user_id,created_at").eq("sku", "pixel_free").like("ref", "free:%").order("created_at", { ascending: false });
for (const r of data ?? []) {
  const { data: u } = await db.auth.admin.getUserById(r.user_id);
  const x = u.user!;
  const [name, dom] = (x.email ?? "-@-").split("@");
  console.log(`${r.user_id.slice(0, 8)} 무료 ${r.created_at.slice(5, 16)} · 메일 ${name.slice(0, 3)}…@${dom} · 가입 ${x.created_at.slice(0, 16)} · 로그인 ${x.last_sign_in_at?.slice(0, 16)} · ${(x.identities ?? []).map((i) => i.provider).join(",") || "익명→연결"} · 꼬리표 ${JSON.stringify(x.user_metadata?.came_from ?? null)}`);
}
