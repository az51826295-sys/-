/**
 * **두근도트 답 하나를 재는 기계 자들** — 한 곳에 둔다(11-23).
 * dot_oneshot_fails(쌓인 실제 답)와 dot_scout_en(새로 뽑은 답)이 같은 자를 쓴다. 기준이 복사본이면 재는 자만 안다.
 * 모델 0 · 값 0.
 */
import { splitBubbles } from "../../src/lib/dot/bubbles";
import { hangulShare } from "../../src/lib/dot/enRegister";

const AI_SELF = ["as an ai", "language model", "i'm an ai", "i am an ai", "인공지능", "ai 라서", "ai라서", "챗봇"];

export type Rule = { id: string; on: "en" | "ko" | "all"; fail: (t: string) => boolean };

const 단어수 = (s: string) => s.split(/\s+/).filter(Boolean).length;

export const RULES: Rule[] = [
  { id: "영어로 물었는데 한글이 섞임(>5%)", on: "en", fail: (t) => hangulShare(t) > 0.05 },
  { id: "한국어로 물었는데 영어로 답(한글<30%)", on: "ko", fail: (t) => hangulShare(t) < 0.3 },
  { id: "말풍선 3개 초과(줄 기준)", on: "all", fail: (t) => t.split("\n").filter((l) => l.trim()).length > 3 },
  { id: "말풍선 평균 30자 초과(한국어)", on: "ko", fail: (t) => { const b = splitBubbles(t); return b.reduce((s, x) => s + x.length, 0) / b.length > 30; } },
  { id: "말풍선 평균 12단어 초과(영어)", on: "en", fail: (t) => { const b = splitBubbles(t); return b.reduce((s, x) => s + 단어수(x), 0) / b.length > 12; } },
  { id: "AI 자칭", on: "all", fail: (t) => AI_SELF.some((w) => t.toLowerCase().includes(w)) },
];
