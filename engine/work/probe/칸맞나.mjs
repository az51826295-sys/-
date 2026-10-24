/**
 * 복원.sql 이 쓰려는 칸들이 **새 DB 에 실제로 있나** — 표마다 그 칸만 골라 조회해 본다.
 * PostgREST 는 없는 칸을 고르면 400 을 준다(10-24 에 이걸로 대화가 죽었다). 그래서 이게 자다.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const 뿌리 = "C:/Users/az518/Desktop/ai-workforce";
const k = JSON.parse(readFileSync(뿌리 + "/.keys/dot-new.json", "utf8"));
const d = JSON.parse(readFileSync(뿌리 + "/engine/work/dot-이사/dot-dump.json", "utf8"));
const db = createClient(k.url, k.service, { auth: { persistSession: false } });

const 공개표 = Object.keys(d).filter((t) => t.startsWith("dot_") && d[t]?.length);
let 나쁨 = 0;
for (const t of 공개표) {
  const 칸 = Object.keys(d[t][0]);
  const r = await db.from(t).select(칸.join(",")).limit(1);
  if (r.error) { 나쁨++; console.log("어긋남 " + t.padEnd(22) + r.status + " " + r.error.message); }
  else console.log("맞음   " + t.padEnd(22) + 칸.length + "칸");
}
console.log("\n공개표 " + 공개표.length + "개 중 어긋난 표 " + 나쁨 + "개");
console.log("auth.users · auth.identities 는 PostgREST 로 못 본다 — 사장님이 돌릴 때 확인된다");
