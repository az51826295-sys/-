// 11-27 도트 작업실 실사용 세기: 무료 받기·쓰기·사기 줄 수(돈 0)
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(/\r?\n/)) { const i = l.indexOf("="); if (i > 0 && /^[A-Z_]+$/.test(l.slice(0, i))) process.env[l.slice(0, i)] ??= l.slice(i + 1).replace(/^"|"$/g, ""); }
const { createClient } = await import("@supabase/supabase-js");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
for (const sku of ["pixel_free", "pixel_use", "pixel_10"]) {
  const { data, error } = await db.from("dot_purchases").select("user_id,credits,ref,created_at").eq("sku", sku).order("created_at", { ascending: false }).limit(20);
  console.log(sku, error?.message ?? `${data!.length}줄 · 사람 ${new Set(data!.map((r) => r.user_id)).size}명`, (data ?? []).slice(0, 5).map((r) => `${r.created_at.slice(5, 16)} ${r.user_id.slice(0, 6)} ${r.credits} ${String(r.ref).slice(0, 40)}`).join(" | "));
}
