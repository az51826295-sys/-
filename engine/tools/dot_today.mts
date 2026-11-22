// 오늘(KST) 두근도트에 누가 왔나 — 새 계정(어디서 왔나, selftest 뺌)·구글 로그인·말 건 사람·결제(Polar/Play).
// npx tsx engine/tools/dot_today.mts [시작시각 ISO, 기본 오늘 00:00 KST]
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

const kstMidnight = new Date(new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10) + "T00:00:00+09:00");
const since = new Date(process.argv[2] ?? kstMidnight.toISOString());
console.log("since", since.toISOString(), "(KST", new Date(since.getTime() + 9 * 3600e3).toISOString().slice(0, 16).replace("T", " ") + ")");

const users: { id: string; created_at: string; is_anonymous?: boolean; user_metadata?: Record<string, unknown>; identities?: { provider: string; created_at?: string }[]; last_sign_in_at?: string }[] = [];
for (let page = 1; page < 50; page++) {
  const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw error;
  users.push(...(data.users as typeof users));
  if (data.users.length < 1000) break;
}
const 새 = users.filter((u) => new Date(u.created_at) >= since && u.user_metadata?.came_from !== "selftest");
const 출처: Record<string, number> = {};
for (const u of 새) { const k = String(u.user_metadata?.came_from ?? "(꼬리표 없음)"); 출처[k] = (출처[k] ?? 0) + 1; }
const 구글새로 = users.filter((u) => (u.identities ?? []).some((i) => i.provider === "google" && i.created_at && new Date(i.created_at) >= since));
const 로그인 = users.filter((u) => !u.is_anonymous && u.last_sign_in_at && new Date(u.last_sign_in_at) >= since);

const ids = 새.map((u) => u.id);
let 말함 = 0;
if (ids.length) {
  const { data } = await db.from("dot_messages").select("user_id").in("user_id", ids).eq("role", "user");
  말함 = new Set((data ?? []).map((r) => r.user_id)).size;
}
const { data: 결제 } = await db.from("dot_purchases").select("sku, credits, source, created_at").gte("created_at", since.toISOString());

console.log("새 계정(시험 뺌):", 새.length, "· 그중 말 건 사람:", 말함);
console.log("어디서:", JSON.stringify(출처));
console.log("구글을 새로 붙인/만든 계정:", 구글새로.length);
console.log("손님 아닌 계정으로 로그인한 사람:", 로그인.length);
console.log("결제·지급 줄:", JSON.stringify((결제 ?? []).map((r) => `${r.source}:${r.sku}:${r.credits}`)));
