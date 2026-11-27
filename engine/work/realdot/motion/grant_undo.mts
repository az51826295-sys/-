// 11-27 잘못 넣은 시험 토큰 빼기 — 내가 넣은 줄(ref grant:<id>:1127)만 지운다. dol… 계정은 사장님 것이 아니었다.
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(/\r?\n/)) { const i = l.indexOf("="); if (i > 0 && /^[A-Z_]+$/.test(l.slice(0, i))) process.env[l.slice(0, i)] ??= l.slice(i + 1).replace(/^"|"$/g, ""); }
const { createClient } = await import("@supabase/supabase-js");
const { pixelBalance } = await import("../../../../src/lib/pixel/credits");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const pre = process.argv[2];
const { data } = await db.from("dot_purchases").select("id,user_id,credits,ref").eq("sku", "pixel_free").like("ref", `grant:${pre}%:1127`);
console.log("찾은 줄", data?.length, data?.map((r) => `${r.user_id.slice(0, 8)} ${r.credits}`).join(" | "));
const { data: used } = await db.from("dot_purchases").select("id,credits,created_at").eq("sku", "pixel_use").eq("user_id", data![0].user_id);
console.log("그 계정이 쓴 줄", used?.length ?? 0);
if (data?.length === 1) { const { error } = await db.from("dot_purchases").delete().eq("id", data[0].id); console.log(error ? `실패 ${error.message}` : `지움 → 토큰 ${await pixelBalance(db as never, data[0].user_id)}`); }
