/**
 * 게시물 자 (78회차 09-11).
 *   (1) 올리는 시각: 11:00~21:59 안, 같은 입력이면 같은 값, 넷이 다 다르다   (2) postDecision 4 경우
 *   (3) 강제로 올리기(force): 공개 캐릭터마다 오늘 하나, 두 번 돌려도 안 늘어난다
 *   (4) 한 줄: ≤50자, AI 자칭 0, 존댓말 캐릭터는 존댓말·반말 캐릭터는 반말(politeness 자)
 *   (5) 좋아요: 처음 1 → 사이 +1, 두 번째 -1(안 늘어남)
 *   (6) 답장 문맥: 게시물 들고 한 턴 → 답에 그 장면 낱말이 있다
 * 모델 호출: 한 줄 4개 + 답장 1턴(시험 계정).
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) { const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0,i).trim()] = l.slice(i+1).trim(); }
process.env.AI_PROVIDER = "deepseek";
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { postMinute, postDecision, postTick } = await import("../../src/lib/dot/posts");
const { todayKST } = await import("../../src/lib/dot/bond");
const { politeness } = await import("../../src/lib/dot/politeness");
const { streamDotTurn } = await import("../../src/lib/dot/turn");

const db = createServiceClient();
const day = todayKST();
const lines: [boolean, string][] = [];

// (1)(2) 순수 함수
const mins = ["yuna", "seoha", "rin", "doyun"].map((s) => postMinute(s, day));
lines.push([mins.every((m) => m >= 660 && m < 1320) && postMinute("yuna", day) === mins[0] && new Set(mins).size === 4, `올리는 시각 ${mins.map((m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`).join(" ")} (창 안·결정적·서로 다름)`]);
const cases: [string, boolean, boolean][] = [
  ["오늘 올렸다", postDecision({ hasPostToday: true, minute: 700 }, 800).go, false],
  ["시각 전", postDecision({ hasPostToday: false, minute: 700 }, 650).go, false],
  ["시각 뒤", postDecision({ hasPostToday: false, minute: 700 }, 800).go, true],
  ["창 밖", postDecision({ hasPostToday: false, minute: 700 }, 1330).go, false],
];
const wrong = cases.filter(([, g, w]) => g !== w).map((c) => c[0]);
lines.push([wrong.length === 0, `결정 ${cases.length - wrong.length}/${cases.length}${wrong.length ? " 틀림: " + wrong.join(", ") : ""}`]);

// (3) 강제로 올리기
const { count: before } = await db.from("dot_posts").select("id", { count: "exact", head: true }).eq("published_on", day);
const r1 = await postTick(db, () => {}, true);
const r2 = await postTick(db, () => {}, true);
const { data: pub } = await db.from("dot_characters").select("id, slug, name, formal_start").eq("is_public", true);
const { data: todays } = await db.from("dot_posts").select("id, character_id, caption").eq("published_on", day);
const per = new Map<string, number>();
for (const t of (todays ?? []) as { character_id: string }[]) per.set(t.character_id, (per.get(t.character_id) ?? 0) + 1);
const allOne = (pub ?? []).every((c) => per.get(c.id as string) === 1);
lines.push([allOne && r2.posted === 0, `오늘 게시물: 공개 ${pub?.length}명 모두 1개 (${before ?? 0} → ${todays?.length}), 두 번째 틱 ${r2.posted}개 (0)`]);

// (4) 한 줄 자
const AI = /AI|인공지능|모델|프로그램|봇/;
let capOk = 0, capN = 0; const capMsgs: string[] = [];
for (const c of (pub ?? []) as { id: string; name: string; formal_start: boolean }[]) {
  const post = ((todays ?? []) as { character_id: string; caption: string }[]).find((t) => t.character_id === c.id);
  if (!post) continue; capN++;
  const p = politeness(post.caption).ratio;
  const voiceOk = p === null ? true : c.formal_start ? p >= 0.5 : p <= 0.5;
  const ok = post.caption.length <= 50 && !AI.test(post.caption) && voiceOk;
  if (ok) capOk++;
  capMsgs.push(`${ok ? "✓" : "✗"}${c.name}(${post.caption.length}자${p === null ? "" : p >= 0.5 ? "·존댓" : "·반말"}) "${post.caption}"`);
}
lines.push([capOk === capN, `한 줄 ${capOk}/${capN}: ${capMsgs.join(" / ")}`]);

// (5)(6) 시험 계정
const { data: list } = await db.auth.admin.listUsers();
const uid = list?.users.find((u) => u.email === "smoke-test@dugeun.local")?.id;
if (!uid) throw new Error("smoke user 없음");
const yuna = (pub ?? []).find((c) => c.slug === "yuna")!;
const post = ((todays ?? []) as { id: number; character_id: string; caption: string }[]).find((t) => t.character_id === yuna.id)!;
await db.from("dot_post_likes").delete().eq("user_id", uid).eq("post_id", post.id);
const { data: b0 } = await db.from("dot_bonds").select("points").eq("user_id", uid).eq("character_id", yuna.id).maybeSingle();
const { data: l1 } = await db.rpc("dot_like_post", { p_user: uid, p_post: post.id });
const { data: l2 } = await db.rpc("dot_like_post", { p_user: uid, p_post: post.id });
const { data: b1 } = await db.from("dot_bonds").select("points").eq("user_id", uid).eq("character_id", yuna.id).maybeSingle();
lines.push([Number(l1) >= 1 && Number(l2) === -1 && Number(b1?.points) === Number(b0?.points ?? 0) + 1, `좋아요 첫 번 ${l1}, 두 번째 ${l2}(-1), 사이 ${b0?.points ?? 0} → ${b1?.points} (+1)`]);

const scene = (yuna as { slug: string }).slug ? post.caption : "";
let reply = "";
const r = await streamDotTurn(db, uid, yuna.id as string, "이거 언제 찍은 거야?", (c) => { reply += c; }, { postCaption: post.caption });
const words = post.caption.replace(/[^가-힣a-zA-Z ]/g, " ").split(/\s+/).filter((w) => w.length >= 2).map((w) => w.slice(0, 2));
const hit = words.some((w) => reply.includes(w));
lines.push([r.ok && hit, `답장 문맥: ${r.ok ? `"${reply}"` : JSON.stringify(r)} ${hit ? "— 게시물 낱말 있음" : "— 게시물 낱말 없음"}`]);
void scene;

for (const [ok, s] of lines) console.log(`  ${ok ? "✅" : "❌"} ${s}`);
console.log(lines.every(([ok]) => ok) ? "모두 통과" : "떨어진 줄 있음");
process.exit(lines.every(([ok]) => ok) ? 0 : 1);
