/** 지금 당장 먼저 말 걸기 — 시험용. `npx tsx engine/tools/dot_ping_now.mts` */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0,i).trim()] ||= l.slice(i+1).trim();
}
process.env.AI_PROVIDER ||= "deepseek";
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { pingTick, pushConfigured } = await import("../../src/lib/dot/push");
const db = createServiceClient();
console.log("푸시 설정:", pushConfigured() ? "있음" : "없음");
const { data: subs } = await db.from("dot_push_subs").select("user_id, endpoint, dead_at");
console.log(`구독 ${subs?.length ?? 0}개:`, (subs ?? []).map((s: { user_id: string; endpoint: string; dead_at: string | null }) => `${s.user_id.slice(0, 8)} ${s.dead_at ? "(죽음)" : ""} ${s.endpoint.slice(0, 40)}…`).join("\n  "));
const r = await pingTick(db, console.log, true);
console.log("결과:", r);
