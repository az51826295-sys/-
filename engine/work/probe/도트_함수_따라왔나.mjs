/**
 * 이사 때 **함수(RPC)가 따라왔나** (10-24, 2판).
 *
 * 1판은 인자 없이 불러서 **있는 함수도 "없다"** 로 적었다 — PostgREST 의
 * "Could not find the function ... **without parameters**" 는 *인자 없는 짝*이 없다는 말이지
 * 함수가 없다는 뜻이 아니다. 자를 먼저 의심한 덕에 잡았다.
 *
 * 2판은 **스키마 파일에서 인자 이름을 읽어** 그대로 부른다. 그러면 PGRST202 가 오는 것은
 * **정말로 없는 것**이다. 값은 **아무 일도 안 일어날 값**을 넣는다(없는 uuid·0·과거 날짜).
 */
import { readFileSync, readdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const 뿌리 = "C:/Users/az518/Desktop/ai-workforce";
const k = JSON.parse(readFileSync(뿌리 + "/.keys/dot-new.json", "utf8"));
const db = createClient(k.url, k.service, { auth: { persistSession: false } });

/** 스키마 파일에서 `함수이름(인자 타입, …)` 을 읽는다 */
const 함수 = new Map();
for (const f of readdirSync(뿌리 + "/supabase").filter((x) => /^schema_dot_.*\.sql$/.test(x))) {
  const s = readFileSync(뿌리 + "/supabase/" + f, "utf8");
  for (const m of s.matchAll(/create (?:or replace )?function (?:public\.)?([a-z0-9_]+)\s*\(([^)]*)\)/gi)) {
    const 인자 = m[2].split(",").map((x) => x.trim()).filter(Boolean)
      .map((x) => { const [이름, ...타] = x.split(/\s+/); return { 이름, 타입: 타.join(" ").toLowerCase() }; });
    함수.set(m[1], 인자);   // 같은 이름이 두 파일에 있으면 뒤엣것으로 덮는다(같은 것이다)
  }
}

/** 아무 일도 안 일어날 값 — 없는 uuid, 0, 빈 글, 아주 먼 과거 */
const 빈값 = (타입) => {
  if (/uuid/.test(타입)) return "00000000-0000-0000-0000-000000000000";
  if (/date/.test(타입)) return "1970-01-01";
  if (/int|bigint|numeric/.test(타입)) return 0;
  if (/bool/.test(타입)) return false;
  return "";
};

console.log("스키마 파일에 적힌 함수 " + 함수.size + "개\n");
let 없음 = 0;
for (const [n, 인자] of [...함수.entries()].sort()) {
  const 값 = Object.fromEntries(인자.map((a) => [a.이름, 빈값(a.타입)]));
  const r = await db.rpc(n, 값);
  const 못찾음 = r.error?.code === "PGRST202";
  if (못찾음) { 없음++; console.log("  **없다**  " + n + "(" + 인자.map((a) => a.이름).join(", ") + ")"); }
  else console.log("  있다    " + n.padEnd(20) + (r.error ? "오류 " + r.error.code + " " + (r.error.message ?? "").slice(0, 50) : "불림"));
}
console.log("\n빠진 함수 " + 없음 + "개 / " + 함수.size + "개");
