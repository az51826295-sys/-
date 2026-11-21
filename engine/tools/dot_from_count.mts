/**
 * 두근도트 — 홍보 꼬리표별로 몇 명이 왔고 몇 명이 대화까지 갔나 (11-22).
 *
 *   npx tsx engine/tools/dot_from_count.mts            최근 30일
 *   npx tsx engine/tools/dot_from_count.mts --days 7
 *
 * 꼬리표는 손님 계정 user_metadata.came_from 에 있다(FromTag → /api/dot/guest). 꼬리표 없는 사람은 "(없음)".
 * "selftest" 는 내가 시험으로 만든 것이라 뺀다. 계정은 **방에 한 번 들어가야** 생긴다 — 피드만 보고 나간 사람은 못 센다(그건 0 이 아니라 "못 봄").
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const days = Number(process.argv[process.argv.indexOf("--days") + 1]) || 30;
const since = Date.now() - days * 86400_000;

const users: { id: string; created_at: string; user_metadata?: Record<string, unknown> }[] = [];
for (let page = 1; ; page++) {
  const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw error;
  users.push(...data.users);
  if (data.users.length < 1000) break;
}
const recent = users.filter((u) => Date.parse(u.created_at) >= since);
const ids = recent.map((u) => u.id);
const talked = new Set<string>();
for (let i = 0; i < ids.length; i += 200) {
  const { data, error } = await db.from("dot_messages").select("user_id").eq("role", "user").in("user_id", ids.slice(i, i + 200));
  if (error) throw error;
  for (const r of (data ?? []) as { user_id: string }[]) talked.add(r.user_id);
}
const groups = new Map<string, { n: number; talked: number }>();
for (const u of recent) {
  const k = String(u.user_metadata?.came_from ?? "(없음)");
  if (k === "selftest") continue;
  const g = groups.get(k) ?? { n: 0, talked: 0 };
  g.n++; if (talked.has(u.id)) g.talked++;
  groups.set(k, g);
}
console.log(`최근 ${days}일 새 계정 ${recent.length}명 (전체 ${users.length}명) — 꼬리표별 [온 사람 · 대화까지 간 사람]`);
for (const [k, g] of [...groups].sort((a, b) => b[1].n - a[1].n)) console.log(`  ${k.padEnd(12)} ${String(g.n).padStart(4)}명 · 대화 ${g.talked}명`);
