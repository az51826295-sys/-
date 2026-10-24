/**
 * **왜 둘째 날 안 오는가** — 1일 차 이탈을 장부로 본다 (10-25).
 *
 * 규칙: **대화 내용은 읽지 않는다.** 남의 사생활이다.
 * 길이·시각·횟수·감정 라벨·응답 속도처럼 **세는 것**으로만 본다.
 */
import { readFileSync } from "node:fs";

const 뿌리 = "C:/Users/az518/Desktop/ai-workforce";
const d = JSON.parse(readFileSync(뿌리 + "/engine/work/dot-이사/dot-dump.json", "utf8"));
const usage = d.dot_usage ?? [], turns = d.dot_turns ?? [], msgs = d.dot_messages ?? [];

/** 사람별로 쓴 날을 모은다 */
const 날들 = {};
for (const u of usage) (날들[u.user_id] ??= []).push(u.day);
const 사람들 = Object.entries(날들).map(([id, ds]) => ({ id, 날수: new Set(ds).size }));
const 떠난사람 = new Set(사람들.filter((p) => p.날수 === 1).map((p) => p.id));
const 남은사람 = new Set(사람들.filter((p) => p.날수 > 1).map((p) => p.id));
console.log("떠난 사람(1일) " + 떠난사람.size + "명 · 남은 사람(2일+) " + 남은사람.size + "명\n");

/** 사람별 첫날 턴만 고른다 */
const 첫날 = {};
for (const t of turns) {
  const day = String(t.created_at).slice(0, 10);
  const p = (첫날[t.user_id] ??= { day: null, 들: [] });
  if (p.day === null || day < p.day) { p.day = day; p.들 = []; }
  if (day === p.day) p.들.push(t);
}

const 묶음 = (집합, 이름) => {
  const 사람 = [...집합].filter((id) => 첫날[id]?.들.length);
  if (!사람.length) { console.log(이름 + ": 턴 기록 없음\n"); return; }
  const 턴수 = 사람.map((id) => 첫날[id].들.length).sort((a, b) => a - b);
  const all = 사람.flatMap((id) => 첫날[id].들);
  const 평 = (f) => { const v = all.map(f).filter((x) => typeof x === "number" && x > 0); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : 0; };
  const 감정 = {}; for (const t of all) { const e = t.emotion ?? "(없음)"; 감정[e] = (감정[e] ?? 0) + 1; }
  console.log("── " + 이름 + " (" + 사람.length + "명, 첫날 턴 " + all.length + "건)");
  console.log("   첫날 턴 수: 가운데값 " + 턴수[Math.floor(턴수.length / 2)] + " · 최소 " + 턴수[0] + " · 최대 " + 턴수[턴수.length - 1]);
  console.log("   첫 글자까지 " + 평((t) => t.ms_first_token) + "ms · 전체 " + 평((t) => t.ms_total) + "ms");
  console.log("   답 길이 " + 평((t) => t.reply_chars) + "자 · 나온 토큰 " + 평((t) => t.output_tokens));
  console.log("   감정: " + Object.entries(감정).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + " " + v).join(", "));
  console.log("");
};
묶음(떠난사람, "하루 쓰고 떠난 사람");
묶음(남은사람, "다시 온 사람");

/** 첫 몇 턴에서 갈리나 — 떠난 사람의 첫날 턴 수 분포 */
const 분포 = {};
for (const id of 떠난사람) { const n = 첫날[id]?.들.length ?? 0; 분포[n] = (분포[n] ?? 0) + 1; }
console.log("── 떠난 사람의 첫날 턴 수: " + Object.entries(분포).sort((a, b) => a[0] - b[0]).map(([k, v]) => k + "턴 " + v + "명").join(" · "));

/** 사람이 보낸 말의 길이 (내용은 안 읽고 길이만) */
const 내말 = msgs.filter((m) => m.role === "user");
const 길이 = (집합) => { const v = 내말.filter((m) => 집합.has(m.user_id)).map((m) => String(m.content ?? "").length); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : 0; };
console.log("\n── 사람이 친 말의 평균 길이: 떠난 사람 " + 길이(떠난사람) + "자 · 남은 사람 " + 길이(남은사람) + "자");

/** 알림을 켠 사람이 있나 — 선톡이 닿을 수 있었나 */
console.log("\n── **알림(선톡) 구독: " + (d.dot_push_subs ?? []).length + "명**");

/** 스티커·표정이 실제로 나갔나 */
const 봇말 = msgs.filter((m) => m.role !== "user");
const 스티커 = 봇말.filter((m) => m.sticker).length;
const 감정있음 = 봇말.filter((m) => m.emotion && m.emotion !== "neutral").length;
console.log("── 캐릭터 답 " + 봇말.length + "줄 중 스티커 " + 스티커 + "줄 · 중립 아닌 표정 " + 감정있음 + "줄");
