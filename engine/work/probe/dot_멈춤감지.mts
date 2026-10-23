/** 로그인 화면 멈춤 띠가 왜 안 뜨나 — 감지 쿼리가 뭘 돌려주는지 본다 (10-23). 모델 0 · 값 0. */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const i = l.indexOf("=");
  if (i > 0 && !l.trimStart().startsWith("#") && !(l.slice(0, i).trim() in process.env)) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
}
const { createClient } = await import("@supabase/supabase-js");
const { 막힌것인가 } = await import("../../../src/lib/dot/outage");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

const r = await db.from("dot_characters").select("id", { count: "exact", head: true }).limit(1);
console.log(" error:", JSON.stringify(r.error));
console.log(" status:", r.status, " count:", r.count);
console.log(" 막힌것인가:", 막힌것인가(r.error, r.status));
