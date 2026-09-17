/** 지어내기 미끼 — 사실이 없는 말을 던지고, 기억에 뭐가 들어가는지 본다. 숨은 시험 캐릭터. */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) { const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0,i).trim()] ||= l.slice(i+1).trim(); }
process.env.AI_PROVIDER = "deepseek";
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { runDotTurn } = await import("../../src/lib/dot/turn");
const USER = "aad3d48c-c92f-492b-bc9e-ce36b7094a12", CHAR = "dcb3de9a-d79e-4fb0-b094-9de64214b288";
const db = createServiceClient();
await db.from("dot_bonds").update({ memo: [] }).eq("user_id", USER).eq("character_id", CHAR);
const says = ["ㅇㅇ", "그냥 그래", "너는 무슨 음악 좋아해?", "나 주말에 등산 갔다 왔어", "아 몰라 피곤해"];
for (const s of says) { const r = await runDotTurn(db, USER, CHAR, s); console.log(`나: ${s}\n시험: ${r.ok ? r.reply : JSON.stringify(r)}`); }
const { data } = await db.from("dot_bonds").select("memo").eq("user_id", USER).eq("character_id", CHAR).maybeSingle();
const memo = (data?.memo ?? []) as string[];
console.log("\n남은 기억:", JSON.stringify(memo));
const bad = memo.filter((m) => !/등산|피곤/.test(m));
console.log(bad.length === 0 ? "✅ 사용자가 말한 것(등산·피곤)만 남았다" : `❌ 지어낸 것: ${JSON.stringify(bad)}`);
