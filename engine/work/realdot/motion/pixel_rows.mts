// 토큰으로 바꾸기 전에: 장부에 실제로 산 장(pixel_10)·쓴 장(pixel_use) 줄이 몇 개인가(읽기만).
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
const { createClient } = await import("@supabase/supabase-js");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const { data, error } = await db.from("dot_purchases").select("user_id,sku,credits,source,created_at").like("sku", "pixel%");
if (error) throw error;
const by = new Map<string, { rows: number; credits: number; users: Set<string> }>();
for (const r of data ?? []) { const k = `${r.sku}/${r.source}`; const v = by.get(k) ?? { rows: 0, credits: 0, users: new Set() }; v.rows++; v.credits += Number(r.credits); v.users.add(r.user_id); by.set(k, v); }
for (const [k, v] of by) console.log(k, `줄 ${v.rows} · 합 ${v.credits} · 사람 ${v.users.size}`);
if (!by.size) console.log("pixel 줄 없음");
