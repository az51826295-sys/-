/**
 * 스스로 다시를 손으로 한 번 걸어 본다(41회차 시험용). 엔진이 산출물 저장 직후 부르는 것과 **같은 함수**다.
 *   npx tsx engine/tools/self_retry.mts <deliverableId>
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { selfRetryFromVerdict } from "../../src/lib/execution/selfRetry";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const id = process.argv[2];
if (!id) { console.error("쓰는 법: self_retry.mts <deliverableId>"); process.exit(1); }
const { data } = await db.from("deliverables").select("deliverable_type, title").eq("id", id).maybeSingle();
if (!data) { console.error("없는 산출물"); process.exit(1); }
console.log(`${data.title} (${data.deliverable_type})`);
console.log(await selfRetryFromVerdict(db, id, data.deliverable_type as string));
