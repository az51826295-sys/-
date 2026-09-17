/**
 * 로키 회귀 자 (92회차 09-12) — 새 DB(rookery-main)에서 로그인·/ask·두고 온 파일 링크. 모델 없음.
 *   (1) 새 계정 비밀번호 로그인 (2) 쿠키로 /ask 200(로그인 화면 아님) (3) 없는 파일 링크 → 404 + 한국어 이유 (4) 옛 사용자 로그인: 해시 그대로라 signIn 이 "잘못된 비밀번호" 로 거절(계정은 있음)
 * rookery_env 로 돌린다. 시험 계정은 끝에 지운다.
 */
import { createClient } from "@supabase/supabase-js";
const { createServiceClient } = await import("../../src/lib/supabase/service");
const BASE = "https://rookery-web-production.up.railway.app";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const svc = createServiceClient();
const email = `regress-${Date.now()}@rookery.local`, password = "regress-pass-0912!";
const lines: [boolean, string][] = [];
let uid = "";
try {
  const { data: made, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true }); if (error) throw error; uid = made.user.id;
  const c = createClient(url, anon, { auth: { persistSession: false } });
  const t0 = Date.now();
  const { data: s, error: e1 } = await c.auth.signInWithPassword({ email, password });
  lines.push([!e1 && !!s.session, `새 계정 로그인 ${e1 ? "실패: " + e1.message : "됨"} (${Date.now() - t0}ms)`]);
  const ref = new URL(url).hostname.split(".")[0];
  const cookie = `sb-${ref}-auth-token=base64-${Buffer.from(JSON.stringify(s.session)).toString("base64url")}`;
  const r = await fetch(`${BASE}/ask`, { headers: { cookie }, redirect: "manual" }); const html = await r.text();
  lines.push([r.status === 200 && !html.includes("들어가기") && html.length > 2000, `/ask ${r.status} · ${html.length}자 · 로그인 화면 ${html.includes("들어가기") ? "임 ✗" : "아님 ✓"}`]);
  const f = await fetch(`${BASE}/api/files/00000000-0000-0000-0000-000000000000`, { headers: { cookie } }); const fj = (await f.json().catch(() => ({}))) as { error?: string };
  lines.push([f.status === 404 && /[가-힣]/.test(fj.error ?? ""), `없는 파일 링크 ${f.status} "${fj.error ?? ""}"`]);
  const { data: list } = await svc.auth.admin.listUsers();
  const old = list?.users.find((u) => u.email && !u.email.endsWith(".local"));
  if (old) { const { error: e2 } = await c.auth.signInWithPassword({ email: old.email!, password: "definitely-wrong-password" });
    lines.push([!!e2 && /invalid/i.test(e2.message), `옛 사용자(${old.email!.replace(/(.{2}).*(@.*)/, "$1…$2")}) 계정 있음 · 틀린 비밀번호는 거절: ${e2?.message ?? "거절 안 함 ✗"}`]); }
} finally { if (uid) await svc.auth.admin.deleteUser(uid).catch(() => {}); }
for (const [ok, s] of lines) console.log(`  ${ok ? "✅" : "❌"} ${s}`);
console.log(lines.every(([ok]) => ok) ? "모두 통과" : "떨어진 줄 있음");
process.exit(lines.every(([ok]) => ok) ? 0 : 1);
