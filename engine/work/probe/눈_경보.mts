/** 14일 내내 같은 경보가 났다 — 무슨 말인가 (10-13). 모델 0 · 값 0. */
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

const { data } = await db.from("genesis_runs").select("run_date, result").order("run_date", { ascending: false }).limit(1);
const eye = ((data?.[0]?.result ?? {}) as Record<string, any>).eye ?? [];
for (const e of eye as Record<string, any>[]) {
  console.log(` [${e.kind}] ${e.title}`);
  console.log(`   ${String(e.detail ?? "").replace(/\s+/g, " ").slice(0, 600)}`);
}
