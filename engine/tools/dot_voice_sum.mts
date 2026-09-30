/**
 * **여러 판을 합쳐 단계별 말투를 판정한다** (227회차 09-30). 값 0.
 *
 *   npx tsx engine/tools/dot_voice_sum.mts 후 후2 후3
 *
 * `dot_voice_test.mts` 한 판은 칸마다 답이 **5개**뿐이다 — 답 하나가 20% 라서 40% 와 20% 는
 * "두 번 vs 한 번" 이고, 그 차이는 흔들림 안이다([[measure-once-hides-variance]]).
 * 판을 합쳐 칸마다 15개로 늘린 뒤에 **방향**만 판정한다: 단계가 오르면 그 축이 늘어나나/줄어드나.
 *
 * 캐릭터마다 봐야 할 축이 다르다(bond.ts stageVoiceFor 가 약속한 것):
 *   유나(polite)   — 존댓말 비율이 **준다**
 *   서하(tsundere) — 부정("딱히·별로…") 비율이 **준다** · 존댓말은 **0 이어야** 한다(반말 캐릭터)
 *   린(blunt)      — 답 길이와 먼저 묻는 비율이 **는다** · 1단계는 15자 이하
 *
 * 차이가 **답 두 개 이하**(15개 중)면 "모른다" 로 적는다 — 늘었다고도 줄었다고도 안 한다.
 */
import { readFileSync, existsSync } from "node:fs";

const 표들 = process.argv.slice(2);
if (!표들.length) { console.error("사용: <표> [표…]"); process.exit(1); }

type 판 = { 캐릭터: string; 단계: number; 답: string[] };
const 모음 = new Map<string, string[]>();
for (const 표 of 표들) {
  const p = `engine/work/voice/${표}.json`;
  if (!existsSync(p)) { console.log(`${표}: 없음 — 건너뜀`); continue; }
  const j = JSON.parse(readFileSync(p, "utf8")) as { 판들: 판[] };
  for (const 판 of j.판들) {
    const k = `${판.캐릭터}|${판.단계}`;
    모음.set(k, [...(모음.get(k) ?? []), ...판.답.filter((a) => !a.startsWith("(실패"))]);
  }
}

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
  return /(요|죠|까|니다|세요|네요|군요|어요|아요)$/u.test(s.slice(-3));
}
const 부정 = /딱히|별로|아니거든|아니야|뭐래|그런 거 아니|그런거 아니/u;

type 셈 = { n: number; 존: number; 문장: number; 길이: number; 질문: number; 부정: number };
function 세기(답: string[]): 셈 {
  let 존 = 0, 문장 = 0;
  for (const a of 답) for (const s of a.split(/(?<=[.!?…])\s+|\n+/u)) { const r = 존댓말끝(s); if (r !== null) { 문장++; if (r) 존++; } }
  return {
    n: 답.length, 존, 문장,
    길이: 답.reduce((t, a) => t + a.replace(/\s+/g, "").length, 0) / Math.max(1, 답.length),
    질문: 답.filter((a) => /\?/.test(a)).length,
    부정: 답.filter((a) => 부정.test(a)).length,
  };
}

const 이름들 = [...new Set([...모음.keys()].map((k) => k.split("|")[0]))];
console.log(`판 ${표들.length}개 합침\n`);
console.log("캐릭터 단계   n  존댓말     글자  질문      부정");
const 표 = new Map<string, 셈>();
for (const 이름 of 이름들) for (const 단계 of [1, 3, 5]) {
  const s = 세기(모음.get(`${이름}|${단계}`) ?? []);
  표.set(`${이름}|${단계}`, s);
  const 퍼 = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(0)}%` : "—").padStart(4);
  console.log(`${이름.padEnd(4)} ${String(단계).padStart(3)}  ${String(s.n).padStart(3)}  ${퍼(s.존, s.문장)}(${s.존}/${s.문장})`.padEnd(30) +
    `${s.길이.toFixed(0).padStart(4)}  ${퍼(s.질문, s.n)}(${s.질문})  ${퍼(s.부정, s.n)}(${s.부정})`);
}

/** 1단계와 5단계 사이 **답 개수 차이**로 방향을 판정. 두 개 이하면 모른다. */
function 방향(a: number, b: number, 늘어야: boolean): string {
  const d = b - a;
  if (Math.abs(d) <= 2) return "모름(흔들림 안)";
  return (d > 0) === 늘어야 ? "✅ 맞는 방향" : "❌ 거꾸로";
}
console.log("\n── 판정 (1단계 → 5단계) ──");
const g = (이름: string, 단계: number) => 표.get(`${이름}|${단계}`)!;
if (표.has("유나|1")) {
  console.log(`유나  존댓말이 준다: ${방향(g("유나", 1).존, g("유나", 5).존, false)} (${g("유나", 1).존} → ${g("유나", 5).존} 문장)`);
}
if (표.has("서하|1")) {
  console.log(`서하  존댓말 0 이어야: ${g("서하", 1).존 + g("서하", 3).존 + g("서하", 5).존 === 0 ? "✅ 0" : `❌ ${g("서하", 1).존 + g("서하", 3).존 + g("서하", 5).존}문장`}`);
  console.log(`서하  부정이 준다:    ${방향(g("서하", 1).부정, g("서하", 5).부정, false)} (${g("서하", 1).부정} → ${g("서하", 5).부정} 답)`);
}
if (표.has("린|1")) {
  const 짧은 = g("린", 1).길이 <= 15;
  console.log(`린    1단계 15자 이하:  ${짧은 ? "✅" : "❌"} (${g("린", 1).길이.toFixed(0)}자)`);
  const 길 = g("린", 5).길이 - g("린", 1).길이;
  console.log(`린    말이 길어진다:  ${Math.abs(길) < 3 ? "모름(3자 안)" : 길 > 0 ? "✅ 맞는 방향" : "❌ 거꾸로"} (${g("린", 1).길이.toFixed(0)} → ${g("린", 5).길이.toFixed(0)}자)`);
  console.log(`린    먼저 묻는다:    ${방향(g("린", 1).질문, g("린", 5).질문, true)} (${g("린", 1).질문} → ${g("린", 5).질문} 답)`);
}
