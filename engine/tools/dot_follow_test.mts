/**
 * 팔로우 자 (83회차 09-12) — 실제 서버에 대고.
 *   (1) 새 사람: 팔로우 0 → 피드 기본은 전체(힌트)   (2) 팔로우 → 피드 기본에 그 캐릭터만
 *   (3) 다른 캐릭터와 첫 말 → 자동 팔로우          (4) 언팔로우 → 피드에서 빠짐   (5) ?all=1 은 늘 전부
 * 모델 1턴. 계정은 끝에 지운다.
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) { const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0,i).trim()] = l.slice(i+1).trim(); }
import { createClient } from "@supabase/supabase-js";
const { createServiceClient } = await import("../../src/lib/supabase/service");
const BASE = process.argv[2] ?? "https://dot-web-production-7e03.up.railway.app";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const svc = createServiceClient();
const email = `follow-${Date.now()}@dugeun.local`, password = "follow-pass-0912!";
const lines: [boolean, string][] = [];
let uid = "";
try {
  const { data: made, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true }); if (error) throw error; uid = made.user.id;
  const c = createClient(url, anon, { auth: { persistSession: false } });
  const { data: s } = await c.auth.signInWithPassword({ email, password });
  const token = s.session!.access_token;
  const ref = new URL(url).hostname.split(".")[0];
  const cookie = `sb-${ref}-auth-token=base64-${Buffer.from(JSON.stringify(s.session)).toString("base64url")}`;
  const H = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  const { data: pub } = await svc.from("dot_characters").select("id, slug, name").eq("is_public", true);
  const yuna = pub!.find((p) => p.slug === "yuna")!, seoha = pub!.find((p) => p.slug === "seoha")!;
  const feedNames = async (q = "") => { const html = await (await fetch(`${BASE}/dot/feed${q}`, { headers: { cookie } })).text();
    const names = new Set<string>(); for (const c of pub!) if (html.includes(`href="/dot/${c.slug}/profile"`)) names.add(c.name); return { names: [...names], hint: html.includes("아직 팔로우한 캐릭터가 없어요") }; };

  const f0 = await feedNames();
  lines.push([f0.hint && f0.names.length >= 2, `팔로우 0 → 피드 전체 ${f0.names.join("·")} · 힌트 ${f0.hint}`]);

  const r1 = await fetch(`${BASE}/api/dot/follow`, { method: "POST", headers: H, body: JSON.stringify({ characterId: yuna.id, follow: true }) });
  const f1 = await feedNames();
  lines.push([r1.status === 200 && f1.names.length === 1 && f1.names[0] === "유나" && !f1.hint, `유나 팔로우 ${r1.status} → 피드 ${f1.names.join("·")} (유나만)`]);

  const r2 = await fetch(`${BASE}/api/dot/chat/stream`, { method: "POST", headers: H, body: JSON.stringify({ characterId: seoha.id, message: "안녕" }) }); await r2.text();
  const { data: fl } = await svc.from("dot_follows").select("character_id").eq("user_id", uid);
  const f2 = await feedNames();
  lines.push([r2.status === 200 && (fl ?? []).some((x) => x.character_id === seoha.id) && f2.names.includes("서하"), `서하와 첫 말 ${r2.status} → 자동 팔로우 ${(fl ?? []).length}명 · 피드 ${f2.names.join("·")}`]);

  const r3 = await fetch(`${BASE}/api/dot/follow`, { method: "POST", headers: H, body: JSON.stringify({ characterId: yuna.id, follow: false }) });
  const f3 = await feedNames();
  lines.push([r3.status === 200 && !f3.names.includes("유나") && f3.names.includes("서하"), `유나 언팔로우 ${r3.status} → 피드 ${f3.names.join("·")}`]);

  const f4 = await feedNames("?all=1");
  lines.push([f4.names.length >= 2, `전체 탭 → ${f4.names.join("·")}`]);
} finally {
  if (uid) await svc.auth.admin.deleteUser(uid).catch(() => {});
}
for (const [ok, s] of lines) console.log(`  ${ok ? "✅" : "❌"} ${s}`);
console.log(lines.every(([ok]) => ok) ? "모두 통과" : "떨어진 줄 있음");
process.exit(lines.every(([ok]) => ok) ? 0 : 1);
