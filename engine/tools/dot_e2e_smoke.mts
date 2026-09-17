/**
 * 출시 전 통째 연기 — **새 사람 하나가 겪는 길을 실제 서버에 대고** 끝까지 간다 (82회차 09-12).
 *
 * 계정 만들기 → 로그인 없이 /dot 은 /login 으로 → 캐릭터 목록 → 첫 말(흘려보내기) → 지난 대화·잔고 →
 * 멘헤라(402 유료) → 광고·충전(503 곧 열려요) → 게시물 좋아요(+1) → 계정 연결(이미 연결됨 400) → 계정 삭제 → 삭제 뒤 401.
 * 줄마다 상태 코드·한국어 문구·걸린 ms 를 적는다. 모델 호출 1턴. 계정은 끝에 지운다(실패해도 admin 으로 지운다).
 *
 *   npx tsx engine/tools/dot_e2e_smoke.mts [https://…]
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) { const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0,i).trim()] = l.slice(i+1).trim(); }
import { createClient } from "@supabase/supabase-js";
const { createServiceClient } = await import("../../src/lib/supabase/service");

const BASE = process.argv[2] ?? "https://dot-web-production-7e03.up.railway.app";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const svc = createServiceClient();
const email = `e2e-${Date.now()}@dugeun.local`, password = "e2e-pass-0912!";
const lines: [boolean, string][] = [];
const t = () => Date.now();
let uid = "";
try {
  // 0) 계정 — 가입 화면 대신 admin 으로(가입 화면은 DotAuth 가 따로 있고, 여기선 API 길만 본다)
  const { data: made, error: e0 } = await svc.auth.admin.createUser({ email, password, email_confirm: true });
  if (e0) throw e0; uid = made.user.id;
  const c = createClient(url, anon, { auth: { persistSession: false } });
  const { data: s, error: e1 } = await c.auth.signInWithPassword({ email, password });
  if (e1) throw e1;
  const H = { authorization: `Bearer ${s.session!.access_token}`, "content-type": "application/json" };

  // 1) 로그인 없이 /dot → /login
  { const t0 = t(); const r = await fetch(`${BASE}/dot`, { redirect: "manual" }); const loc = r.headers.get("location") ?? "";
    lines.push([r.status >= 300 && r.status < 400 && loc.includes("/login"), `로그인 없이 /dot → ${r.status} ${loc.replace(BASE, "")} (${t() - t0}ms)`]); }

  // 2) 캐릭터 목록
  const { data: pub } = await svc.from("dot_characters").select("id, slug").eq("is_public", true);
  { const t0 = t(); const r = await fetch(`${BASE}/api/dot/characters`); const j = (await r.json()) as { characters?: unknown[] } | unknown[];
    const n = Array.isArray(j) ? j.length : (j as { characters?: unknown[] }).characters?.length ?? 0;
    lines.push([r.status === 200 && n >= 3, `캐릭터 목록 ${r.status} · ${n}명 (${t() - t0}ms)`]); }
  const yuna = (pub ?? []).find((p) => p.slug === "yuna")!;

  // 3) 첫 말 — 흘려보내기
  { const t0 = t(); let first = 0, reply = "", done: { remaining?: number; emotion?: string; bond?: { stage: number } } | null = null;
    const r = await fetch(`${BASE}/api/dot/chat/stream`, { method: "POST", headers: H, body: JSON.stringify({ characterId: yuna.id, message: "안녕, 처음 왔어" }) });
    const reader = r.body!.getReader(); const dec = new TextDecoder(); let buf = "";
    while (true) { const { value, done: d } = await reader.read(); if (d) break; buf += dec.decode(value, { stream: true });
      let i; while ((i = buf.indexOf("\n")) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (!line.trim()) continue; const ev = JSON.parse(line);
        if (ev.type === "delta") { if (!first) first = t() - t0; reply += ev.text; } if (ev.type === "done") done = ev; } }
    lines.push([r.status === 200 && !!done && done.remaining === 29 && reply.length > 0, `첫 말 ${r.status} · 첫 글자 ${first}ms · 합 ${t() - t0}ms · 남은 ${done?.remaining} (29) · 표정 ${done?.emotion} · "${reply.slice(0, 40)}"`]); }

  // 4) 지난 대화·잔고
  { const t0 = t(); const r = await fetch(`${BASE}/api/dot/history?characterId=${yuna.id}`, { headers: H }); const j = (await r.json()) as { messages: unknown[]; bond: { stage: number; mode: string }; remaining: number; balance: { adLeft: number; credits: number } };
    // 말 2줄(사람·답) + 스티커 한 장이면 3줄 — 96회차부터 답이 짧아져 첫 턴에 스티커(89회차 규칙)가 자주 붙는다.
    lines.push([r.status === 200 && (j.messages.length === 2 || j.messages.length === 3) && j.remaining === 29 && j.balance.adLeft === 2 && j.bond.mode === "normal", `지난 대화 ${r.status} · 말 ${j.messages.length}줄(2~3) · 남은 ${j.remaining}(29) · 광고 ${j.balance.adLeft}(2) · 모드 ${j.bond.mode} (${t() - t0}ms)`]); }

  // 5) 멘헤라 → 402
  { const r = await fetch(`${BASE}/api/dot/mode`, { method: "POST", headers: H, body: JSON.stringify({ characterId: yuna.id, mode: "menhera" }) }); const j = (await r.json()) as { paywall?: boolean; price?: string; error?: string };
    lines.push([r.status === 402 && j.paywall === true && !!j.price, `멘헤라 ${r.status} · ${j.error} ${j.price ?? ""}`]); }

  // 6) 광고·충전 → 503 곧 열려요
  { const a = await fetch(`${BASE}/api/dot/ad`, { method: "POST", headers: H }); const ja = (await a.json()) as { error?: string };
    const b = await fetch(`${BASE}/api/dot/buy`, { method: "POST", headers: H, body: JSON.stringify({ sku: "turns_50" }) }); const jb = (await b.json()) as { error?: string };
    lines.push([a.status === 503 && b.status === 503 && /곧/.test(ja.error ?? "") && /곧/.test(jb.error ?? ""), `광고 ${a.status} "${ja.error}" · 충전 ${b.status} "${jb.error}"`]); }

  // 7) 게시물 좋아요 → 사이 +1, 두 번째는 already
  { const { data: post } = await svc.from("dot_posts").select("id").eq("character_id", yuna.id).order("id", { ascending: false }).limit(1).maybeSingle();
    if (!post) lines.push([false, "유나 게시물이 없다"]);
    else { const { data: b0 } = await svc.from("dot_bonds").select("points").eq("user_id", uid).eq("character_id", yuna.id).maybeSingle();
      const r1 = await fetch(`${BASE}/api/dot/posts`, { method: "POST", headers: H, body: JSON.stringify({ postId: post.id }) }); const j1 = (await r1.json()) as { likes?: number };
      const r2 = await fetch(`${BASE}/api/dot/posts`, { method: "POST", headers: H, body: JSON.stringify({ postId: post.id }) }); const j2 = (await r2.json()) as { already?: boolean };
      const { data: b1 } = await svc.from("dot_bonds").select("points").eq("user_id", uid).eq("character_id", yuna.id).maybeSingle();
      lines.push([r1.status === 200 && (j1.likes ?? 0) >= 1 && j2.already === true && Number(b1?.points) === Number(b0?.points) + 1, `좋아요 ${r1.status} likes=${j1.likes} · 두 번째 already=${j2.already} · 사이 ${b0?.points}→${b1?.points}`]); } }

  // 8) 계정 연결 → 이미 연결됨
  { const r = await fetch(`${BASE}/api/dot/link`, { method: "POST", headers: H, body: JSON.stringify({ email: "x@y.z", password: "12345678" }) }); const j = (await r.json()) as { error?: string };
    lines.push([r.status === 400 && /이미/.test(j.error ?? ""), `계정 연결 ${r.status} "${j.error}"`]); }

  // 9) 계정 삭제 → 그 뒤 401
  { const bad = await fetch(`${BASE}/api/dot/account`, { method: "DELETE", headers: H, body: JSON.stringify({ confirm: "아니" }) });
    const r = await fetch(`${BASE}/api/dot/account`, { method: "DELETE", headers: H, body: JSON.stringify({ confirm: "삭제" }) });
    const after = await fetch(`${BASE}/api/dot/history?characterId=${yuna.id}`, { headers: H });
    const { data: gone } = await svc.auth.admin.getUserById(uid);
    lines.push([bad.status === 400 && r.status === 200 && after.status === 401 && !gone?.user, `계정 삭제: 문구 틀림 ${bad.status}(400) · 삭제 ${r.status}(200) · 뒤 ${after.status}(401) · auth 에 ${gone?.user ? "남음 ✗" : "없음 ✓"}`]);
    if (!gone?.user) uid = ""; }
} finally {
  if (uid) await svc.auth.admin.deleteUser(uid).catch(() => {});
}
for (const [ok, s] of lines) console.log(`  ${ok ? "✅" : "❌"} ${s}`);
console.log(lines.every(([ok]) => ok) ? "모두 통과" : "떨어진 줄 있음");
process.exit(lines.every(([ok]) => ok) ? 0 : 1);
