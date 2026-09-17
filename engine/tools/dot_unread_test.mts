/**
 * 안 읽은 수 자 (86회차 09-12) — 실서버. 모델 없음.
 *   (1) 캐릭터 말 2개가 오면 채팅 탭에 배지 2   (2) 방을 열면 배지 사라짐   (3) 또 오면 1
 *   (4) 방 안에서 한 턴 주고받으면(답 + 스티커) 배지 0 — 09-13 사장님 화면 배지 5: 방 열 때만 읽음을 찍었다. 모델 1턴.
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) { const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0,i).trim()] = l.slice(i+1).trim(); }
import { createClient } from "@supabase/supabase-js";
const { createServiceClient } = await import("../../src/lib/supabase/service");
const BASE = process.argv[2] ?? "https://dot-web-production-7e03.up.railway.app";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const svc = createServiceClient();
const email = `unread-${Date.now()}@dugeun.local`, password = "unread-pass-0912!";
const lines: [boolean, string][] = [];
let uid = "";
try {
  const { data: made, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true }); if (error) throw error; uid = made.user.id;
  const c = createClient(url, anon, { auth: { persistSession: false } });
  const { data: s } = await c.auth.signInWithPassword({ email, password });
  const ref = new URL(url).hostname.split(".")[0];
  const cookie = `sb-${ref}-auth-token=base64-${Buffer.from(JSON.stringify(s.session)).toString("base64url")}`;
  const { data: yuna } = await svc.from("dot_characters").select("id, slug").eq("slug", "yuna").maybeSingle();
  await svc.from("dot_bonds").upsert({ user_id: uid, character_id: yuna!.id, points: 3, stage: 1 }, { onConflict: "user_id,character_id" });
  const say = async (n: number) => { for (let i = 0; i < n; i++) await svc.from("dot_messages").insert({ user_id: uid, character_id: yuna!.id, role: "character", content: `먼저 거는 말 ${Date.now()}`, emotion: "happy" }); };
  const badge = async () => { const html = await (await fetch(`${BASE}/dot/chats`, { headers: { cookie } })).text(); const m = html.match(/class="kl-badge"[^>]*>(\d+)</); return m ? Number(m[1]) : 0; };

  await say(2);
  const b1 = await badge();
  lines.push([b1 === 2, `캐릭터 말 2개 → 배지 ${b1} (2)`]);
  const r = await fetch(`${BASE}/dot/${yuna!.slug}`, { headers: { cookie } });
  const b2 = await badge();
  lines.push([r.status === 200 && b2 === 0, `방 열기 ${r.status} → 배지 ${b2} (0)`]);
  await say(1);
  const b3 = await badge();
  lines.push([b3 === 1, `한 개 더 → 배지 ${b3} (1)`]);
  // (4) 방 안에서 말 한 번: 실서버 스트림 API 로 한 턴(모델). 답이 온 뒤 배지는 0 이어야 한다.
  const t = await fetch(`${BASE}/api/dot/chat/stream`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ characterId: yuna!.id, message: "안녕 나 지금 방에 있어" }) });
  await t.text();
  const b4 = await badge();
  lines.push([t.status === 200 && b4 === 0, `방 안에서 한 턴(${t.status}) → 배지 ${b4} (0)`]);
} finally {
  if (uid) await svc.auth.admin.deleteUser(uid).catch(() => {});
}
for (const [ok, s] of lines) console.log(`  ${ok ? "✅" : "❌"} ${s}`);
console.log(lines.every(([ok]) => ok) ? "모두 통과" : "떨어진 줄 있음");
process.exit(lines.every(([ok]) => ok) ? 0 : 1);
