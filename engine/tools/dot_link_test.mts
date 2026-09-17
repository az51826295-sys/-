/**
 * 계정 연결 자 — 익명으로 시작한 사람이 이메일을 붙이면 **같은 사람으로, 사이 그대로** 남는가 (76회차 09-11).
 *
 * 모델 없음, 결정적. 익명 로그인 → 사이 한 줄(점수 7) → updateUser(email, password) → 새 클라이언트로 그 이메일 로그인 →
 *   (1) 익명 로그인 됨  (2) 연결 오류 없음  (3) 같은 id  (4) is_anonymous=false  (5) 점수 7 그대로  (6) 같은 이메일 두 번째 연결은 거절
 * 끝나면 시험 계정을 지운다.
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) { const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0,i).trim()] = l.slice(i+1).trim(); }
import { createClient } from "@supabase/supabase-js";
const { createServiceClient } = await import("../../src/lib/supabase/service");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const fresh = () => createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
const svc = createServiceClient();
const email = `link-test-${Date.now()}@dugeun.local`, password = "link-test-pass-1";
const lines: [boolean, string][] = [];
const ids: string[] = [];
try {
  const a = fresh();
  const { data: anonIn, error: e1 } = await a.auth.signInAnonymously();
  lines.push([!e1 && !!anonIn.user, `익명 로그인 ${e1 ? "실패: " + e1.message : "됨"}`]);
  const uid = anonIn.user!.id; ids.push(uid);
  const { data: ch } = await svc.from("dot_characters").select("id").eq("slug", "test-plumbing").maybeSingle();
  await svc.from("dot_bonds").upsert({ user_id: uid, character_id: ch!.id, points: 7, stage: 1 }, { onConflict: "user_id,character_id" });

  const { error: e2 } = await a.auth.updateUser({ email, password });
  lines.push([!e2, `연결 ${e2 ? "실패: " + e2.message : "됨"}`]);

  const b = fresh();
  const { data: back, error: e3 } = await b.auth.signInWithPassword({ email, password });
  lines.push([!e3 && back.user?.id === uid, `그 이메일로 다시 들어오면 같은 사람 ${e3 ? "실패: " + e3.message : back.user?.id === uid ? "✓" : "✗ 다른 id"}`]);
  lines.push([back.user?.is_anonymous === false, `is_anonymous=${back.user?.is_anonymous}`]);
  const { data: bond } = await svc.from("dot_bonds").select("points").eq("user_id", uid).eq("character_id", ch!.id).maybeSingle();
  lines.push([bond?.points === 7, `사이 점수 ${bond?.points} (7 그대로)`]);

  const c = fresh();
  const { data: anon2 } = await c.auth.signInAnonymously(); if (anon2.user) ids.push(anon2.user.id);
  const { error: e4 } = await c.auth.updateUser({ email, password });
  lines.push([!!e4, `같은 이메일 두 번째 연결 ${e4 ? "거절 ✓ (" + e4.message + ")" : "통과됨 ✗"}`]);
} finally {
  for (const id of ids) await svc.auth.admin.deleteUser(id).catch(() => {});
}
for (const [ok, s] of lines) console.log(`  ${ok ? "✅" : "❌"} ${s}`);
console.log(lines.every(([ok]) => ok) ? "모두 통과" : "떨어진 줄 있음");
process.exit(lines.every(([ok]) => ok) ? 0 : 1);
