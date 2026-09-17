/**
 * 폰으로 이어하기 자 (99회차 09-13) — 실서버. 모델 없음, 지출 0.
 *   (1) 로그인 안 한 사람 → 401          (2) 로그인 → QR(svg) + /auth/handoff?t= 주소
 *   (3) 그 주소를 "폰"(쿠키 없는 새 요청)이 열면 → 307 /ask?c=<대화> + 세션 쿠키
 *   (4) 그 쿠키로 대화 목록을 부르면 컴퓨터에서 만든 대화가 보인다 = 같은 계정
 *   (5) 같은 QR 두 번째 → 로그인 화면(한 번만)   (6) 봉투를 한 글자 고치면 → 로그인 화면(위조)
 *   (7) 2분 지난 봉투(시계를 되돌려 싼 것) → 로그인 화면(만료)   (8) 남의 대화 id 를 넣어도 내 /ask 로만
 *   npx tsx engine/tools/rookery_env.mts engine/tools/rookery_handoff_test.mts [BASE]
 */
import { createClient } from "@supabase/supabase-js";
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { sealHandoff } = await import("../../src/lib/auth/handoff");
const BASE = process.argv[2] ?? "https://rookery-web-production.up.railway.app";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const svc = createServiceClient();
const email = `handoff-${Date.now()}@rookery.local`, password = "handoff-pass-0913!";
const lines: [boolean, string][] = [];
let uid = "", uid2 = "";
const loc = (r: Response) => (r.headers.get("location") ?? "").replace(BASE, "");
try {
  const { data: made, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true }); if (error) throw error; uid = made.user.id;
  const { data: made2 } = await svc.auth.admin.createUser({ email: `other-${Date.now()}@rookery.local`, password, email_confirm: true }); uid2 = made2!.user!.id;
  const c = createClient(url, anon, { auth: { persistSession: false } });
  const { data: s } = await c.auth.signInWithPassword({ email, password });
  const ref = new URL(url).hostname.split(".")[0];
  const cookie = `sb-${ref}-auth-token=base64-${Buffer.from(JSON.stringify(s!.session)).toString("base64url")}`;
  const cv = (await svc.from("conversations").insert({ owner_id: uid, title: "컴퓨터에서 만든 대화" }).select("id").single()).data!;
  const cvOther = (await svc.from("conversations").insert({ owner_id: uid2, title: "남의 대화" }).select("id").single()).data!;

  const r1 = await fetch(`${BASE}/api/handoff`, { method: "POST" });
  lines.push([r1.status === 401, `로그인 없이 → ${r1.status} (401)`]);

  const r2 = await fetch(`${BASE}/api/handoff`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ conversationId: cv.id }) });
  const j2 = (await r2.json()) as { url?: string; svg?: string; expiresInSec?: number };
  lines.push([r2.status === 200 && !!j2.url?.includes("/auth/handoff?t=") && !!j2.svg?.startsWith("<svg") && j2.expiresInSec === 120, `QR 받기 → ${r2.status} · svg ${j2.svg?.length ?? 0}자 · ${j2.expiresInSec}초`]);
  const leaked = j2.url ? /token_hash|[0-9a-f]{56}/.test(j2.url) : true;
  lines.push([!leaked, `QR 주소에 매직 링크 원문이 안 보임(암호화 봉투): ${leaked ? "보임 ✗" : "안 보임"}`]);

  const r3 = await fetch(j2.url!, { redirect: "manual" });
  const setCookies = r3.headers.getSetCookie().filter((x) => x.startsWith(`sb-${ref}-auth-token`));
  lines.push([r3.status === 307 && loc(r3) === `/ask?c=${cv.id}` && setCookies.length > 0, `폰이 QR 열기 → ${r3.status} ${loc(r3).slice(0, 50)} · 세션 쿠키 ${setCookies.length}개`]);

  const phoneCookie = setCookies.map((x) => x.split(";")[0]).join("; ");
  const r4 = await fetch(`${BASE}/api/conversations`, { headers: { cookie: phoneCookie } });
  const list = ((await r4.json()) as { conversations?: { id: string }[] }).conversations ?? [];
  lines.push([list.some((x) => x.id === cv.id), `폰 세션으로 대화 목록 → 컴퓨터 대화 ${list.some((x) => x.id === cv.id) ? "보임" : "안 보임"} (${list.length}개)`]);

  const r5 = await fetch(j2.url!, { redirect: "manual" });
  lines.push([loc(r5).startsWith("/login?error="), `같은 QR 두 번째 → ${decodeURIComponent(loc(r5)).slice(0, 40)}`]);

  const t = new URL(j2.url!).searchParams.get("t")!;
  const tampered = t.slice(0, -2) + (t.at(-2) === "A" ? "B" : "A") + t.at(-1);
  const r6 = await fetch(`${BASE}/auth/handoff?t=${tampered}`, { redirect: "manual" });
  lines.push([loc(r6).startsWith("/login?error="), `봉투 한 글자 고침 → ${decodeURIComponent(loc(r6)).slice(0, 40)}`]);

  const { data: fresh } = await svc.auth.admin.generateLink({ type: "magiclink", email });
  const old = sealHandoff(fresh.properties!.hashed_token, "/ask", Date.now() - 10 * 60_000);
  const r7 = await fetch(`${BASE}/auth/handoff?t=${old}`, { redirect: "manual" });
  lines.push([decodeURIComponent(loc(r7)).includes("만료"), `2분 지난 봉투 → ${decodeURIComponent(loc(r7)).slice(0, 40)}`]);

  const r8 = await fetch(`${BASE}/api/handoff`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ conversationId: cvOther.id }) });
  const u8 = ((await r8.json()) as { url?: string }).url!;
  const r8b = await fetch(u8, { redirect: "manual" });
  lines.push([loc(r8b) === "/ask", `남의 대화 id 를 넣으면 → ${loc(r8b)} (/ask)`]);
} finally {
  if (uid) await svc.auth.admin.deleteUser(uid).catch(() => {});
  if (uid2) await svc.auth.admin.deleteUser(uid2).catch(() => {});
}
for (const [ok, s] of lines) console.log(`  ${ok ? "✅" : "❌"} ${s}`);
console.log(lines.every(([ok]) => ok) ? "모두 통과" : "떨어진 줄 있음");
process.exit(lines.every(([ok]) => ok) ? 0 : 1);
