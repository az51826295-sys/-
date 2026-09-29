/**
 * **친밀도 점검** (227회차 09-29, 사장님 "친밀도 시스템 점검"). 모델 0 · 값 0.
 *
 *   npx tsx engine/tools/dot_bond_audit.mts
 *
 * 친밀도는 모델이 아니라 **규칙이 센다**(`src/lib/dot/bond.ts`). 그래서 잴 수 있다. 셋을 잰다:
 *
 *  ① **셈이 맞나** — 순수 함수를 직접 돌려 본다(문턱·하루 첫 대화·연속·성의).
 *  ② **저장된 것이 셈과 맞나** — `dot_bonds.stage` 가 `stageFor(points)` 와 어긋나 있으면
 *     어딘가에서 딴 길로 쓴 것이다. 숫자가 저 혼자 흘러간 적이 이 회사에 여러 번 있었다.
 *  ③ **단계가 정말 말투를 바꾸나** — 이게 진짜 물건이다. 09-09 에 한 번 쟀다가
 *     "1단계도 2단계도 존댓말 100%" 가 나와 규칙을 고쳤다([[adjectives-dont-survive-the-ruler]]).
 *     그 자를 다시 댄다: 실제 대화에서 **단계별 존댓말 문장 비율**.
 *
 * 기대치는 코드가 적어 놓은 숫자에서 온다(지어내지 않는다):
 *   1단계 전부 존댓말 · 2단계 셋 중 하나쯤 반말 · 3단계 절반 · 4단계 거의 반말 · 5단계 전부 반말
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
}
const { stageFor, applyTurn, toNextStage, todayKST, toEmotion } = await import("../../src/lib/dot/bond");
const { createServiceClient } = await import("../../src/lib/supabase/service");

let 어긋남 = 0;
const 재기 = (이름: string, 맞나: boolean, 본것?: unknown) => {
  if (!맞나) 어긋남++;
  console.log(`${맞나 ? "맞음  " : "어긋남"} ${이름}${맞나 ? "" : "  → " + JSON.stringify(본것)}`);
};

// ── ① 셈이 맞나 ────────────────────────────────────────────────
console.log("── ① 셈 ──");
재기("0점은 1단계", stageFor(0) === 1, stageFor(0));
재기("19점은 1단계 · 20점은 2단계", stageFor(19) === 1 && stageFor(20) === 2, [stageFor(19), stageFor(20)]);
재기("120점 3단계 · 400점 4단계 · 1000점 5단계",
  stageFor(120) === 3 && stageFor(400) === 4 && stageFor(1000) === 5,
  [stageFor(120), stageFor(400), stageFor(1000)]);
재기("아주 큰 점수도 5단계에서 멈춘다", stageFor(999999) === 5, stageFor(999999));
재기("5단계면 다음 단계가 없다", toNextStage(1000) === null, toNextStage(1000));

const 빈것 = { points: 0, stage: 1, streakDays: 0, lastTalkedOn: null as string | null };
const 첫턴 = applyTurn(빈것, "2026-09-29", "안녕");
재기("하루 첫 대화는 6점(턴1 + 첫대화5)", 첫턴.gained === 6, 첫턴);
재기("첫날 연속은 1일", 첫턴.next.streakDays === 1, 첫턴.next.streakDays);

const 같은날 = applyTurn(첫턴.next, "2026-09-29", "응");
재기("같은 날 두 번째 턴은 1점", 같은날.gained === 1, 같은날.gained);

const 이튿날 = applyTurn({ ...첫턴.next }, "2026-09-30", "안녕");
재기("이튿날은 2일 연속 +2 붙어 8점", 이튿날.gained === 8 && 이튿날.next.streakDays === 2, 이튿날);

const 하루빠짐 = applyTurn({ points: 50, stage: 2, streakDays: 5, lastTalkedOn: "2026-09-27" }, "2026-09-29", "안녕");
재기("하루 빠지면 연속이 1로 돌아간다", 하루빠짐.next.streakDays === 1, 하루빠짐.next.streakDays);

const 긴말 = applyTurn(빈것, "2026-09-29", "가".repeat(20));
재기("15자 넘으면 성의 +1 (첫날이면 7점)", 긴말.gained === 7, 긴말.gained);
const 짧은말 = applyTurn(빈것, "2026-09-29", "ㅇㅇ");
재기("짧은 말은 성의 점수 없음", 짧은말.gained === 6, 짧은말.gained);

// 하루치 30턴이면 2단계에 닿는다고 주석이 적어 놓았다 — 진짜 그런가
{
  let st = { ...빈것 };
  for (let i = 0; i < 30; i++) st = applyTurn(st, "2026-09-29", i === 0 ? "안녕하세요 오늘 하루 어땠어요" : "ㅇㅇ").next;
  재기("짧게 30턴이면 2단계 (코드 주석이 약속한 것)", st.stage >= 2, { 점수: st.points, 단계: st.stage });
}
// 연속이 7일에서 멈추는가(Math.min(streak, 7))
{
  let st = { points: 0, stage: 1, streakDays: 0, lastTalkedOn: null as string | null };
  const 날 = (n: number) => new Date(Date.UTC(2026, 8, 1 + n)).toISOString().slice(0, 10);
  const 붙음: number[] = [];
  for (let d = 0; d < 10; d++) { const g = applyTurn(st, 날(d), "안녕"); 붙음.push(g.gained); st = g.next; }
  재기("연속 보너스는 7에서 멈춘다", Math.max(...붙음.slice(7)) === 13, 붙음);
}
재기("표정은 목록 밖이 와도 여섯 중 하나로 접힌다", toEmotion("ecstatic") === "neutral" && toEmotion("기쁨") === "happy", [toEmotion("ecstatic"), toEmotion("기쁨")]);

// ── ② 저장된 것이 셈과 맞나 ─────────────────────────────────────
console.log("\n── ② 저장된 것 ──");
const db = createServiceClient();
const { data: bs, error } = await db.from("dot_bonds").select("user_id, character_id, points, stage, streak_days, last_talked_on");
if (error) { console.log("못 읽음:", error.message); }
else {
  type B = { user_id: string; character_id: string; points: number; stage: number; streak_days: number | null; last_talked_on: string | null };
  const 줄 = (bs ?? []) as B[];
  let 틀린단계 = 0, 음수 = 0, 이상연속 = 0;
  const 분포 = new Map<number, number>();
  for (const b of 줄) {
    const 맞는단계 = stageFor(b.points ?? 0);
    if (맞는단계 !== b.stage) { 틀린단계++; console.log(`  어긋남 점수 ${b.points} → 셈 ${맞는단계} 단계인데 저장은 ${b.stage}`); }
    if ((b.points ?? 0) < 0) 음수++;
    if ((b.streak_days ?? 0) < 0 || (b.streak_days ?? 0) > 400) 이상연속++;
    분포.set(b.stage, (분포.get(b.stage) ?? 0) + 1);
  }
  console.log(`사이 ${줄.length}줄 · 단계 분포 ${[...분포.entries()].sort().map(([s, n]) => `${s}단계 ${n}`).join(" · ")}`);
  재기("저장된 단계가 점수와 맞는다", 틀린단계 === 0, `${틀린단계}줄 어긋남`);
  재기("점수에 음수가 없다", 음수 === 0, 음수);
  재기("연속 일수가 말이 된다", 이상연속 === 0, 이상연속);
  console.log(`오늘(KST) ${todayKST()}`);
}

// ── ③ 단계가 말투를 바꾸나 ──────────────────────────────────────
console.log("\n── ③ 말투 (단계별 존댓말 비율) ──");
{
  const { data: ms } = await db.from("dot_messages")
    .select("user_id, character_id, role, content").eq("role", "character").limit(4000);
  const { data: bs2 } = await db.from("dot_bonds").select("user_id, character_id, stage");
  const 단계 = new Map<string, number>();
  for (const b of (bs2 ?? []) as { user_id: string; character_id: string; stage: number }[]) 단계.set(`${b.user_id}|${b.character_id}`, b.stage);

  /**
   * 문장 끝이 존댓말인가. 끝 어미만 본다 — 중간 말은 섞여 있어 못 가른다.
   *
   * **뒤에 붙는 것을 먼저 뗀다.** "좋아요ㅎㅎ" · "그래요 😊" 를 그냥 보면 끝이 `요` 가 아니라
   * 반말로 세어진다. 09-29 첫 판에서 실제로 그랬을 수 있어 뗀 뒤 다시 잰다.
   */
  const 존댓말끝 = (문장: string): boolean | null => {
    let s = 문장.trim();
    let 전 = "";
    while (s !== 전) {
      전 = s;
      s = s.replace(/[\s.,!?~…"'()[\]<>:;\-_*]+$/u, "");          // 문장부호·따옴표
      s = s.replace(/[ㅋㅎㅠㅜㅡㄴㅇ]+$/u, "");                      // ㅋㅋ ㅎㅎ ㅠㅠ
      s = s.replace(/(헤|하|흐|후|히|호)+$/u, "");                   // 헤헤 하하 흐흐 — 웃음은 어미가 아니다
      s = s.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2190}-\u{21FF}]+$/u, "");  // 이모지
    }
    if (s.length < 2) return null;                       // 너무 짧으면 못 잼 — 통과로도 실패로도 안 센다
    const 끝 = s.slice(-3);
    if (/(요|죠|까|다|니다|세요|네요|군요|는데요|어요|아요)$/u.test(끝)) {
      // "-다" 는 평서 반말("맛있다")도 된다 — "습니다/입니다" 만 존댓말로 본다
      if (/다$/u.test(끝) && !/니다$/u.test(끝)) return false;
      return true;
    }
    return false;
  };
  const 셈 = new Map<number, { 존대: number; 반말: number }>();
  /** 1단계인데 반말로 세어진 문장 — **자가 맞는지 사람이 눈으로 본다.** */
  const 본보기: string[] = [];
  for (const m of (ms ?? []) as { user_id: string; character_id: string; content: string }[]) {
    const st = 단계.get(`${m.user_id}|${m.character_id}`);
    if (!st) continue;
    for (const 문장 of String(m.content).split(/(?<=[.!?…])\s+|\n+/u)) {
      const r = 존댓말끝(문장);
      if (r === null) continue;
      const c = 셈.get(st) ?? { 존대: 0, 반말: 0 };
      if (r) c.존대++;
      else { c.반말++; if (st === 1 && 본보기.length < 12) 본보기.push(문장.trim().slice(0, 44)); }
      셈.set(st, c);
    }
  }
  /**
   * **캐릭터마다 갈라서도 본다.**
   *
   * 합쳐 세면 안 보이는 것이 있다: 린("어, 왔네.")과 도윤("…오늘도 야근이야.")은 **처음부터 반말**로
   * 쓰인 캐릭터다. 그런데 단계 규칙은 1단계를 "모든 문장을 존댓말로" 라고 못 박는다. 둘이 부딪힌다.
   * 합친 숫자로는 "규칙이 안 지켜진다" 와 "이 캐릭터는 원래 반말이다" 를 못 가른다
   * ([[count-paths-and-split-the-tally]] — 합쳐 센 숫자가 한쪽의 0 을 덮는다).
   */
  const 이름 = new Map<string, string>();
  {
    const { data: cs } = await db.from("dot_characters").select("id, name");
    for (const c of (cs ?? []) as { id: string; name: string }[]) 이름.set(c.id, c.name);
  }
  const 사람별 = new Map<string, { 존대: number; 반말: number }>();
  for (const m of (ms ?? []) as { user_id: string; character_id: string; content: string }[]) {
    const st = 단계.get(`${m.user_id}|${m.character_id}`);
    if (!st) continue;
    for (const 문장 of String(m.content).split(/(?<=[.!?…])\s+|\n+/u)) {
      const r = 존댓말끝(문장);
      if (r === null) continue;
      const k = `${이름.get(m.character_id) ?? "?"}|${st}`;
      const c = 사람별.get(k) ?? { 존대: 0, 반말: 0 };
      if (r) c.존대++; else c.반말++;
      사람별.set(k, c);
    }
  }
  console.log("  캐릭터별 (문장 20개 미만은 못 믿는다):");
  for (const [k, c] of [...사람별.entries()].sort()) {
    const n = c.존대 + c.반말;
    console.log(`    ${k.replace("|", " ")}단계  존댓말 ${((c.존대 / n) * 100).toFixed(0)}%  (문장 ${n}개)${n < 20 ? "  ← 적음" : ""}`);
  }

  const 기대: Record<number, [number, number]> = { 1: [0.9, 1.0], 2: [0.55, 0.9], 3: [0.35, 0.7], 4: [0.05, 0.4], 5: [0, 0.25] };
  if (!셈.size) console.log("잴 대화가 없다 — 못 잰다(실패가 아니다).");
  if (본보기.length) {
    console.log("  1단계인데 반말로 세어진 문장 — **자가 맞는지 눈으로 볼 것**:");
    for (const b of 본보기) console.log(`    · ${b}`);
  }
  for (const [st, c] of [...셈.entries()].sort()) {
    const n = c.존대 + c.반말;
    const 비율 = c.존대 / n;
    const [lo, hi] = 기대[st] ?? [0, 1];
    const 맞나 = 비율 >= lo && 비율 <= hi;
    if (n < 20) console.log(`  ${st}단계  존댓말 ${(비율 * 100).toFixed(0)}%  (문장 ${n}개 — **적어서 못 믿는다**)`);
    else 재기(`${st}단계 존댓말 ${(비율 * 100).toFixed(0)}% (기대 ${lo * 100}~${hi * 100}%)`, 맞나, `문장 ${n}개`);
  }
}

console.log(어긋남 ? `\n**어긋남 ${어긋남}개**` : "\n**전부 맞음**");
