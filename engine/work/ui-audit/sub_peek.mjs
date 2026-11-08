import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
}
const { createClient } = await import("@supabase/supabase-js");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const { data, error } = await db.from("dot_entitlements").select("user_id, menhera_until");
if (error) { console.log("못 읽음:", error.message); process.exit(1); }
const now = Date.now();
const 산것 = (data ?? []).filter((r) => r.menhera_until && new Date(r.menhera_until).getTime() > now);
console.log(`멘헤라 줄 ${data.length}개 · **지금 살아 있는 구독 ${산것.length}건**`);
for (const r of 산것.slice(0, 5)) console.log(`  ${r.user_id.slice(0, 8)}… → ${r.menhera_until}`);
const { data: p } = await db.from("dot_payments").select("id, sku, created_at").limit(20);
console.log(`결제 기록 ${p ? p.length : "표 없음"}건${p && p.length ? ": " + p.map((x) => x.sku).join(", ") : ""}`);
