/** 자가진화 고리가 마지막에 언제 돌았나 (10-13 확인용). 모델 0 · 값 0. */
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

const { data: r, error } = await db.from("learning_candidates")
  .select("id, status, created_at, decided_at").order("created_at", { ascending: false }).limit(10);
if (error) { console.error("learning_candidates 못 읽음:", error.message); }
else for (const x of r ?? []) console.log(` ${String(x.status).padEnd(9)} ${String(x.created_at).slice(0, 16)} ${x.decided_at ? "판정" : "**보류**"}`);

const { data: c } = await db.from("learning_candidates").select("created_at").order("created_at", { ascending: false }).limit(1);
console.log(`\n 후보 마지막: ${c?.[0]?.created_at ?? "없음"}`);
const { count: 보류 } = await db.from("learning_candidates").select("*", { count: "exact", head: true }).eq("status", "pending");
console.log(` 보류 규칙: ${보류 ?? 0}개`);
