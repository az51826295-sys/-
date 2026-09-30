/**
 * **단계가 정말 말투를 바꾸나 — 같은 말을 걸어 재기** (227회차 09-30, 사장님 "다 해놔 결과물 자동으로").
 *
 *   npx tsx engine/tools/dot_voice_test.mts 전      # 고치기 전 서버(대조군)
 *   npx tsx engine/tools/dot_voice_test.mts 후      # 고친 뒤
 *
 * `dot_bond_audit.mts` 는 **쌓인 대화**를 쟀다 — 사람마다 한 말도, 시각도 달라서 단계만 가를 수가 없다.
 * 여기서는 **같은 다섯 마디**를 캐릭터 셋 × 단계 1·3·5 에 똑같이 건다. 다른 것은 단계뿐이다.
 * 그리고 **고치기 전 서버에서 먼저 한 번** 돌린다 — 대조군 없이 "나아졌다" 고 하면 그건 느낌이다
 * ([[words-into-rulers]] — 대조군이 없으면 뭐든 통과한다).
 *
 * 실제 서버(`dot-web`)의 채팅 API 를 **Bearer 토큰**으로 부른다(안드로이드 앱과 같은 길) — 사람이 받는 답 그대로다.
 * 시험 계정은 끝나면 지운다.
 *
 * 캐릭터마다 **가까워짐이 드러나는 축**이 다르므로 넷을 다 잰다:
 *   존댓말 비율(유나) · 부정 비율(서하) · 답 길이와 질문 비율(린)
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
}
import { createClient } from "@supabase/supabase-js";
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { todayKST } = await import("../../src/lib/dot/bond");

const 표 = process.argv[2] ?? "시험";
const BASE = "https://dot-web-production-7e03.up.railway.app";
const svc = createServiceClient();
const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });

const 캐릭터 = ["yuna", "seoha", "rin"];
const 단계점수: Record<number, number> = { 1: 0, 3: 120, 5: 1000 };
/** 사람 쪽 말은 반말 — 두근도트 쓰는 사람 대부분이 그렇게 말한다. 다섯 마디가 **모든 판에서 같다.** */
const 할말 = [
  "안녕! 뭐 하고 있었어?",
  "나 오늘 진짜 피곤했어",
  "요즘 재밌는 거 있어?",
  "내일 시험이라 좀 걱정돼",
  "고마워, 얘기하니까 좀 낫다",
];

/** 문장 끝이 존댓말인가 — dot_bond_audit.mts 와 같은 자(웃음소리·이모지를 떼고 본다). */
function 존댓말끝(문장: string): boolean | null {
  let s = 문장.trim(), 전 = "";
  while (s !== 전) {
    전 = s;
    s = s.replace(/[\s.,!?~…"'()[\]<>:;\-_*]+$/u, "");
    s = s.replace(/[ㅋㅎㅠㅜㅡㄴㅇ]+$/u, "");
    s = s.replace(/(헤|하|흐|후|히|호|풉)+$/u, "");
    s = s.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]+$/u, "");
  }
  if (s.length < 2) return null;
  const 끝 = s.slice(-3);
  if (/(요|죠|까|니다|세요|네요|군요|어요|아요)$/u.test(끝)) return true;
  return false;
}
const 부정 = /딱히|별로|아니거든|아니야|뭐래|그런 거 아니|그런거 아니/u;

type 판 = { 캐릭터: string; 단계: number; 서버가본단계: number[]; 답: string[] };
const 판들: 판[] = [];

for (const slug of 캐릭터) {
  const { data: ch } = await svc.from("dot_characters").select("id, name").eq("slug", slug).maybeSingle();
  if (!ch) { console.log(`${slug} 없음`); continue; }
  for (const 단계 of [1, 3, 5]) {
    // 이메일엔 **한글을 못 넣는다** — 첫 판에서 "전" 이 들어가 9개 계정이 전부 "invalid format" 으로 튕겼다.
    const email = `voice-${slug}-${단계}-${Date.now().toString(36)}@dot.test`;
    const password = randomBytes(18).toString("base64url");
    const { data: made, error: me } = await svc.auth.admin.createUser({ email, password, email_confirm: true });
    if (me || !made.user) { console.log("계정 못 만듦:", me?.message); continue; }
    const uid = made.user.id;
    try {
      await svc.from("dot_follows").upsert({ user_id: uid, character_id: ch.id }, { onConflict: "user_id,character_id" });
      // 오늘 이미 말한 것으로 둔다 — 안 그러면 첫 턴에 "오늘 첫 대화 +5" 가 붙어 단계가 움직일 수 있다.
      const { error: be } = await svc.from("dot_bonds").upsert({
        user_id: uid, character_id: ch.id, points: 단계점수[단계], stage: 단계, streak_days: 1, last_talked_on: todayKST(),
      }, { onConflict: "user_id,character_id" });
      if (be) { console.log("사이 못 넣음:", be.message); continue; }
      const { data: s, error: se } = await anon.auth.signInWithPassword({ email, password });
      if (se || !s.session) { console.log("로그인 실패:", se?.message); continue; }
      const token = s.session.access_token;

      const 판: 판 = { 캐릭터: ch.name as string, 단계, 서버가본단계: [], 답: [] };
      for (const 말 of 할말) {
        const r = await fetch(`${BASE}/api/dot/chat`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify({ characterId: ch.id, message: 말 }),
        });
        const j = (await r.json().catch(() => ({}))) as { ok?: boolean; reply?: string; bond?: { stage: number }; message?: string };
        if (!j.ok || !j.reply) { 판.답.push(`(실패 ${r.status} ${j.message ?? ""})`); continue; }
        판.답.push(j.reply);
        판.서버가본단계.push(j.bond?.stage ?? -1);
      }
      판들.push(판);
      console.log(`  ${ch.name} ${단계}단계 · 답 ${판.답.length} · 서버가 본 단계 ${[...new Set(판.서버가본단계)].join(",")}`);
    } finally {
      for (const t of ["dot_messages", "dot_bonds", "dot_follows", "dot_usage"]) await svc.from(t).delete().eq("user_id", uid);
      await svc.auth.admin.deleteUser(uid);
    }
  }
}

// ── 잰다 ────────────────────────────────────────────────────
type 잰것 = { 캐릭터: string; 단계: number; 존댓말: number | null; 길이: number; 질문: number; 부정: number; 단계맞음: boolean };
const 결과: 잰것[] = 판들.map((p) => {
  const 좋은답 = p.답.filter((a) => !a.startsWith("(실패"));
  let 존 = 0, 반 = 0;
  for (const a of 좋은답) for (const 문장 of a.split(/(?<=[.!?…])\s+|\n+/u)) { const r = 존댓말끝(문장); if (r === true) 존++; else if (r === false) 반++; }
  const n = Math.max(1, 좋은답.length);
  return {
    캐릭터: p.캐릭터, 단계: p.단계,
    존댓말: 존 + 반 ? 존 / (존 + 반) : null,
    길이: 좋은답.reduce((s, a) => s + a.replace(/\s+/g, "").length, 0) / n,
    질문: 좋은답.filter((a) => /\?/.test(a)).length / n,
    부정: 좋은답.filter((a) => 부정.test(a)).length / n,
    // **심은 단계가 진짜 들어갔나.** 서버가 다른 단계로 봤으면 이 판은 무효다.
    단계맞음: p.서버가본단계.length > 0 && p.서버가본단계.every((s) => s === p.단계),
  };
});

console.log(`\n── ${표} ──`);
console.log("캐릭터 단계  존댓말   글자수  질문   부정   단계");
for (const r of 결과) {
  console.log(`${r.캐릭터.padEnd(4)} ${String(r.단계).padStart(3)}   ${r.존댓말 === null ? "  —  " : `${(r.존댓말 * 100).toFixed(0).padStart(3)}%`}   ${r.길이.toFixed(0).padStart(4)}   ${(r.질문 * 100).toFixed(0).padStart(3)}%  ${(r.부정 * 100).toFixed(0).padStart(3)}%   ${r.단계맞음 ? "맞음" : "**틀림**"}`);
}
mkdirSync("engine/work/voice", { recursive: true });
writeFileSync(`engine/work/voice/${표}.json`, JSON.stringify({ 표, 때: new Date().toISOString(), 할말, 판들, 결과 }, null, 1));
console.log(`\n→ engine/work/voice/${표}.json (답 원문 포함)`);
