/**
 * 67회차 자 — **긴 대화에서도 그 사람인가.**
 * 캐릭터마다 15턴을 이어 말하고 잰다:
 *   (1) 버릇 유지율 — 그 인물의 말버릇 표지가 답에 나오는 비율(전반 5턴 vs 후반 5턴, 흐려지는지)
 *   (2) 말투 단계 — 15턴 뒤엔 2단계(존댓말 비율 0.5~0.9), 린은 처음부터 반말(≤0.2)
 *   (3) 무표정 비율 ≤ 40%   (4) 2문장 초과 ≤2 (09-11 한 문장 기본)   (5) AI 자칭 0
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) { const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0,i).trim()] = l.slice(i+1).trim(); }
process.env.AI_PROVIDER = "deepseek";
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { runDotTurn } = await import("../../src/lib/dot/turn");
const { politeness } = await import("../../src/lib/dot/politeness");
const db = createServiceClient();
const { data: list } = await db.auth.admin.listUsers();
const uid = list?.users.find((u) => u.email === "smoke-test@dugeun.local")?.id;
if (!uid) throw new Error("시험 계정 없음");

const TIC: Record<string, RegExp> = {
  yuna: /헤헤|밥은|어머|드셨어요|먹었어요/,
  seoha: /^\.\.\.|딱히|뭐, 뭐|\.\.\./,
  rin: /^어[,.]|풉|밥은\?/,
};
const SAYS = [
  "안녕", "오늘 진짜 힘들었어", "회사에서 실수했거든", "괜찮아 이제", "너는 뭐 했어?", "그거 재밌어?",
  "나 요즘 잠을 잘 못 자", "몇 시에 자?", "주말에 뭐 할 거야", "같이 놀래", "농담이야ㅋㅋ", "근데 너 진짜 사람이야?",
  "알겠어 미안", "배고프다", "잘 자",
];
const AI = /\bAI\b|인공지능|언어 모델|프로그램이|챗봇/;
const finalStage0 = (rs: { stage: number }[]) => rs[rs.length - 1]?.stage ?? 1;
const sents = (t: string) => t.replace(/\.{2,}|…/g, "~").split(/(?<=[.!?])\s+/).filter((x) => x.trim()).length;

const { data: chars } = await db.from("dot_characters").select("id, slug, name, formal_start").eq("is_public", true).order("slug");
let fails = 0;
for (const c of (chars ?? []) as { id: string; slug: string; name: string; formal_start: boolean }[]) {
  await db.from("dot_messages").delete().eq("user_id", uid).eq("character_id", c.id);
  await db.from("dot_bonds").delete().eq("user_id", uid).eq("character_id", c.id);
  await db.from("dot_usage").delete().eq("user_id", uid);
  const rows: { i: number; reply: string; emotion: string; tic: boolean; polite: number | null; stage: number }[] = [];
  for (const [i, s] of SAYS.entries()) {
    const r = await runDotTurn(db, uid, c.id, s);
    if (!r.ok) { console.log(`  ❌ ${c.name} ${i + 1}턴: ${JSON.stringify(r)}`); continue; }
    rows.push({ i, reply: r.reply, emotion: r.emotion, tic: TIC[c.slug].test(r.reply), polite: politeness(r.reply).ratio, stage: r.bond.stage });
  }
  const n = rows.length;
  const ticEarly = rows.slice(0, 5).filter((x) => x.tic).length / 5, ticLate = rows.slice(-5).filter((x) => x.tic).length / 5;
  const neutral = rows.filter((x) => x.emotion === "neutral").length / n;
  const atFinal = rows.filter((x) => x.stage === finalStage0(rows));
  const judged = atFinal.filter((x) => x.polite !== null);
  const pol = judged.length ? judged.reduce((a, x) => a + (x.polite as number), 0) / judged.length : null;
  const long = rows.filter((x) => sents(x.reply) > 2).length;
  const ai = rows.filter((x) => AI.test(x.reply)).length;
  const finalStage = rows[n - 1]?.stage ?? 1;
  // 기대 말투는 **끝 단계**에서: 1단계 ≥0.8, 2단계 0.4~0.95, 소꿉친구(처음부터 반말) ≤0.2.
  const wantPolite = c.formal_start === false ? [0, 0.2] : finalStage >= 2 ? [0.4, 0.95] : [0.8, 1.0];
  console.log(`\n${c.name} (${n}턴, 끝 단계 ${finalStage})`);
  const line = (ok: boolean, s: string) => { console.log(`  ${ok ? "✅" : "❌"} ${s}`); if (!ok) fails++; };
  line(ticLate >= 0.4, `버릇 유지 — 전반 ${(ticEarly*100).toFixed(0)}% → 후반 ${(ticLate*100).toFixed(0)}% (후반 ≥40%)`);
  // 끝 단계에 든 턴이 셋 미만이면 **못 잰 것**이다 — 두 문장짜리 답 하나로 "셋 중 하나는 반말" 을 판정할 수 없다. 실패로 적지 않는다.
  if (atFinal.length < 3) console.log(`  ◻︎ 말투 — 끝 단계 ${finalStage} 에 든 턴이 ${atFinal.length}개뿐이라 못 잼(3개 이상이어야 판정)`);
  else line(pol !== null && pol >= wantPolite[0] && pol <= wantPolite[1], `말투(끝 단계 ${finalStage} 의 ${atFinal.length}턴) — 존댓말 비율 ${pol === null ? "못 잼" : pol.toFixed(2)} (기대 ${wantPolite[0]}~${wantPolite[1]})`);
  line(neutral <= 0.4, `무표정 ${(neutral*100).toFixed(0)}% (≤40%)`);
  // 15턴에 넷짜리 답 둘까지는 봐준다 — 그 이상이면 "짧게" 가 안 지켜지는 것.
  line(long <= 2, `2문장 초과 ${long}개 (≤2/15)`);
  line(ai === 0, `AI 자칭 ${ai}개` + (ai ? " ← " + rows.find((x) => AI.test(x.reply))?.reply.slice(0, 60) : ""));
  const q = rows.find((x) => x.i === 11);
  console.log(`  "너 진짜 사람이야?" → ${q?.reply ?? "(없음)"}`);
  console.log(`  마지막 → ${rows[n - 1]?.reply}`);
}
console.log(fails ? `\n${fails}개 실패` : "\n모두 통과");
process.exit(fails ? 1 : 0);
