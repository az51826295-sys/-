// 11-27 사장님이 사이트 버튼으로 돌린 판(장부 ref)을 본다 — 진짜 경로의 첫 기록(돈 0)
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(/\r?\n/)) { const i = l.indexOf("="); if (i > 0 && /^[A-Z_]+$/.test(l.slice(0, i))) process.env[l.slice(0, i)] ??= l.slice(i + 1).replace(/^"|"$/g, ""); }
const { createClient } = await import("@supabase/supabase-js");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const { data } = await db.from("dot_purchases").select("credits,ref,created_at,user_id").eq("sku", "pixel_use").order("created_at", { ascending: true });
for (const r of data ?? []) console.log(`${new Date(r.created_at).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul" })} ${r.user_id.slice(0, 8)} ${r.credits} ${r.ref}`);
