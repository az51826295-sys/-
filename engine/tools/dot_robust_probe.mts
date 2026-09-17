/**
 * 73회차 자 — 먼저 말 걸기(배달만 빼고)와 버티기.
 *   A. 먼저 거는 한마디 ×3: ≤40자 · 물음표로 끝남 · AI 자칭 없음 · 기억이 있으면 그 낱말을 씀 · 방에 남음
 *   B. 동시에 5턴: dot_usage.turns 가 정확히 +5, 대화 행 +10 (두 번 세거나 놓치면 실패)
 *   C. 모델이 죽었을 때(가짜 열쇠): 실패를 돌려주고 **턴을 되돌린다** (usage 그대로), 방에 반쪽 답이 안 남는다
 * 시험 계정·가짜 푸시 구독으로 두근도트 프로젝트에서. 끝나면 가짜 구독은 지운다.
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) { const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0,i).trim()] = l.slice(i+1).trim(); }
process.env.AI_PROVIDER = "deepseek";
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { runDotTurn } = await import("../../src/lib/dot/turn");
const { pingTick } = await import("../../src/lib/dot/push");
const { roots } = await import("../../src/lib/dot/memo");
const { memoForToday } = await import("../../src/lib/dot/push");
const { todayKST } = await import("../../src/lib/dot/bond");
const db = createServiceClient();
const { data: list } = await db.auth.admin.listUsers();
const uid = list?.users.find((u) => u.email === "smoke-test@dugeun.local")?.id;
if (!uid) throw new Error("시험 계정 없음");
let fails = 0;
const line = (ok: boolean, s: string) => { console.log(`  ${ok ? "✅" : "❌"} ${s}`); if (!ok) fails++; };
const AI = /\bAI\b|인공지능|언어 모델|프로그램이|챗봇/;

// ── A. 먼저 말 걸기 ──
console.log("A. 먼저 거는 한마디");
const FAKE = "https://fcm.googleapis.com/fcm/send/fake-" + Date.now();
await db.from("dot_push_subs").upsert({ user_id: uid, endpoint: FAKE, p256dh: "BPfake", auth: "fake", dead_at: null }, { onConflict: "endpoint" });
const { data: bonds } = await db.from("dot_bonds").select("character_id, points, memo").eq("user_id", uid);
const best = (bonds ?? []).sort((a, b) => (b.points as number) - (a.points as number))[0];
const { data: ch } = await db.from("dot_characters").select("name").eq("id", best.character_id).maybeSingle();
const chosen = memoForToday((best.memo as string[]) ?? []);
const memoRoots = new Set<string>(chosen ? roots(chosen) : []);
console.log(`  오늘 건드릴 기억: ${chosen ?? "(없음)"}`);
for (let k = 0; k < 3; k++) {
  await db.from("dot_bonds").update({ last_pinged_on: null }).eq("user_id", uid).eq("character_id", best.character_id);
  await db.from("dot_push_subs").update({ dead_at: null }).eq("endpoint", FAKE);   // 가짜 주소는 매번 죽는다 — 되살려 다음 판도 돈다
  const before = Date.now();
  await pingTick(db, () => {}, true);
  const { data: m } = await db.from("dot_messages").select("content, emotion, created_at").eq("user_id", uid).eq("character_id", best.character_id).eq("role", "character").order("id", { ascending: false }).limit(1).maybeSingle();
  const text = (m?.content as string) ?? "";
  const fresh = m && new Date(m.created_at as string).getTime() >= before - 2000;
  const usesMemo = memoRoots.size === 0 ? null : [...roots(text)].some((r) => memoRoots.has(r));
  console.log(`  ${k + 1}) ${ch?.name}: "${text}" [${m?.emotion}]`);
  line(!!fresh, "방에 남았다");
  line(text.length > 0 && text.length <= 40, `길이 ${text.length}자 (≤40)`);
  line(/[?？]\s*$/.test(text) || /요\?|어\?|야\?|까\?/.test(text), "묻는 말로 끝난다");
  line(!AI.test(text), "AI 자칭 없음");
  if (usesMemo === null) console.log("  ◻︎ 기억이 없어 '기억을 썼나' 는 못 잼"); else line(usesMemo, `기억 낱말을 썼다 (${[...memoRoots].slice(0, 5).join(",")}…)`);
}
await db.from("dot_push_subs").delete().eq("endpoint", FAKE);

// ── B. 동시에 5턴 ──
console.log("B. 동시에 5턴");
const day = todayKST();
const { data: c0 } = await db.from("dot_characters").select("id").eq("slug", "test-plumbing").maybeSingle();
const cid = c0!.id as string;
await db.from("dot_usage").delete().eq("user_id", uid).eq("day", day);
const { count: m0 } = await db.from("dot_messages").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("character_id", cid);
const results = await Promise.all([1, 2, 3, 4, 5].map((i) => runDotTurn(db, uid, cid, `동시 시험 ${i}`)));
const { data: u } = await db.from("dot_usage").select("turns").eq("user_id", uid).eq("day", day).maybeSingle();
const { count: m1 } = await db.from("dot_messages").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("character_id", cid);
line(results.every((r) => r.ok), `5턴 전부 성공 (${results.filter((r) => r.ok).length}/5)`);
line(Number(u?.turns) === 5, `turns = ${u?.turns} (정확히 5)`);
line((m1 ?? 0) - (m0 ?? 0) === 10, `대화 행 +${(m1 ?? 0) - (m0 ?? 0)} (정확히 10)`);

// ── C. 모델이 죽었을 때 ──
console.log("C. 모델이 죽었을 때(가짜 열쇠)");
const realKey = process.env.DEEPSEEK_API_KEY!;
process.env.DEEPSEEK_API_KEY = "sk-fake-dead";
const { data: u0 } = await db.from("dot_usage").select("turns").eq("user_id", uid).eq("day", day).maybeSingle();
const { count: mA } = await db.from("dot_messages").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("character_id", cid);
const r = await runDotTurn(db, uid, cid, "죽었니?");
process.env.DEEPSEEK_API_KEY = realKey;
const { data: u1 } = await db.from("dot_usage").select("turns").eq("user_id", uid).eq("day", day).maybeSingle();
const { count: mB } = await db.from("dot_messages").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("character_id", cid);
line(!r.ok && r.reason === "failed", `실패를 돌려준다 (${!r.ok ? r.reason : "ok?!"})`);
line(Number(u1?.turns) === Number(u0?.turns), `턴을 되돌렸다 (${u0?.turns} → ${u1?.turns})`);
line((mB ?? 0) === (mA ?? 0), "반쪽 답이 방에 안 남았다");

console.log(fails ? `\n${fails}개 실패` : "\n모두 통과");
process.exit(fails ? 1 : 0);
