/**
 * 검수용 계정 (97회차 09-13, 사장님 "도트 검수 좀 제대로 해") — 실서버를 내 브라우저로 눈으로 보기 위한 준비.
 *   계정 만들기 → 린·유나와 실제 모델로 몇 턴 → 게시물 좋아요 → 세션 쿠키를 파일로(저장소 밖) → 지우기는 --delete <uid>
 *   npx tsx engine/tools/dot_qa_session.mts            → 쿠키 파일 경로와 uid 를 찍는다
 *   npx tsx engine/tools/dot_qa_session.mts --delete <uid>
 */
import { readFileSync, writeFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) { const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0,i).trim()] = l.slice(i+1).trim(); }
import { createClient } from "@supabase/supabase-js";
const { createServiceClient } = await import("../../src/lib/supabase/service");
const BASE = "https://dot-web-production-7e03.up.railway.app";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const svc = createServiceClient();
const OUT = `${process.env.LOCALAPPDATA}/rookery-dot/qa-cookie.txt`;

if (process.argv[2] === "--link") {
  // 비밀번호 없이 들어가는 링크(/auth/confirm) — 검수 브라우저용. 한 번 쓰면 끝.
  const { email } = JSON.parse(readFileSync(OUT, "utf8")) as { email: string };
  const { data, error } = await svc.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  const base = process.argv[3] ?? "http://localhost:3000";
  console.log(`${base}/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink`);
  process.exit(0);
}
if (process.argv[2] === "--delete") { await svc.auth.admin.deleteUser(process.argv[3]); console.log("지움", process.argv[3]); process.exit(0); }

const email = `qa-${Date.now()}@dugeun.local`, password = `qa-${Math.random().toString(36).slice(2)}!`;
const { data: made, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true }); if (error) throw error;
const uid = made.user.id;
const c = createClient(url, anon, { auth: { persistSession: false } });
const { data: s } = await c.auth.signInWithPassword({ email, password });
const ref = new URL(url).hostname.split(".")[0];
const cookieName = `sb-${ref}-auth-token`;
const cookieVal = `base64-${Buffer.from(JSON.stringify(s!.session)).toString("base64url")}`;
const cookie = `${cookieName}=${cookieVal}`;
const chars = (await svc.from("dot_characters").select("id, slug, name").in("slug", ["rin", "yuna"])).data ?? [];
const say = async (cid: string, m: string) => { const r = await fetch(`${BASE}/api/dot/chat/stream`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ characterId: cid, message: m }) }); await r.text(); return r.status; };
for (const ch of chars) {
  const msgs = ch.slug === "rin" ? ["안녕 나 검수야", "오늘 회사에서 혼났어", "그래도 저녁에 치킨 먹을 거야"] : ["안녕하세요", "오늘 뭐 했어요?"];
  for (const m of msgs) console.log(ch.name, await say(ch.id as string, m), m);
}
const post = (await svc.from("dot_posts").select("id").order("id", { ascending: false }).limit(1)).data?.[0];
if (post) console.log("좋아요", (await fetch(`${BASE}/api/dot/posts`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ postId: post.id, action: "like" }) })).status);
writeFileSync(OUT, JSON.stringify({ uid, email, cookieName, cookieVal }), "utf8");
console.log(`uid ${uid}\n쿠키 파일 ${OUT}`);
