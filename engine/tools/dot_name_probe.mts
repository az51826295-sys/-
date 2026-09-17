/**
 * 이름 자 (88회차 09-12) — 카톡 친구처럼 이름을 묻고, 기억하고, 부른다.
 *   (1) 기억이 비었을 때 첫 두 턴 안에 이름을 묻는다      (2) "나 민수야" 뒤 기억에 민수가 있다
 *   (3) 그 뒤 세 턴 중 한 번 이상 "민수" 를 부른다         모델 5턴, 새 계정(끝에 지움)
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) { const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0,i).trim()] = l.slice(i+1).trim(); }
process.env.AI_PROVIDER = "deepseek";
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { streamDotTurn } = await import("../../src/lib/dot/turn");
const db = createServiceClient();
const { data: made, error } = await db.auth.admin.createUser({ email: `name-${Date.now()}@dugeun.local`, password: "name-pass-0912!", email_confirm: true }); if (error) throw error;
const uid = made.user.id;
const lines: [boolean, string][] = [];
try {
  const { data: ch } = await db.from("dot_characters").select("id, name").eq("slug", "yuna").maybeSingle();
  const cid = ch!.id as string;
  const turn = async (m: string) => { let s = ""; const r = await streamDotTurn(db, uid, cid, m, (c) => { s += c; }); if (!r.ok) throw new Error(JSON.stringify(r)); return s; };
  const r1 = await turn("안녕!"), r2 = await turn("오늘 날씨 좋다");
  const asked = /이름|뭐라고 부르|어떻게 부르|어떻게 불러/.test(r1 + r2);
  lines.push([asked, `이름 묻기: ${asked ? "물음" : "안 물음"} — "${r1.slice(0, 40)}" / "${r2.slice(0, 40)}"`]);
  const r3 = await turn("나는 민수야");
  const { data: b } = await db.from("dot_bonds").select("memo").eq("user_id", uid).eq("character_id", cid).maybeSingle();
  const memo = (b?.memo as string[]) ?? [];
  lines.push([memo.some((m) => m.includes("민수")), `기억: ${JSON.stringify(memo)}`]);
  const r4 = await turn("오늘 뭐 했어?"), r5 = await turn("나 좀 피곤해"), r6 = await turn("내일 또 올게");
  const called = [r3, r4, r5, r6].filter((r) => r.includes("민수")).length;
  lines.push([called >= 1, `이름 부르기 ${called}/4 턴 — "${r4.slice(0, 40)}" / "${r5.slice(0, 40)}" / "${r6.slice(0, 40)}"`]);
} finally { await db.auth.admin.deleteUser(uid).catch(() => {}); }
for (const [ok, s] of lines) console.log(`  ${ok ? "✅" : "❌"} ${s}`);
console.log(lines.every(([ok]) => ok) ? "모두 통과" : "떨어진 줄 있음");
process.exit(lines.every(([ok]) => ok) ? 0 : 1);
