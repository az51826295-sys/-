/**
 * **싼 AI 가 한 번에 얼마나 자주 떨어지나 — 두근도트 실제 답으로** (11-23). 읽기만 · 모델 0 · 값 0.
 *   npx tsx engine/tools/dot_oneshot_fails.mts
 *
 * 고르는 자 첫 판(비서 말투)은 천장(22/24)이라 고를 게 없었다(select-by-ruler-design.md).
 * 그래서 다음 대상을 고르기 전에 **한 번 답이 기계 자에 얼마나 떨어지는지** 실제 운영 답으로 먼저 센다.
 * 저장된 답은 이미 tidyReply(마침표 떼기)를 지난 것이다 — 그 칸은 기계가 이미 맞춘다.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { splitBubbles } from "../../src/lib/dot/bubbles";
import { hangulShare } from "../../src/lib/dot/enRegister";

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

type M = { user_id: string; character_id: string; role: string; content: string; created_at: string };
const all: M[] = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from("dot_messages").select("user_id,character_id,role,content,created_at").order("created_at").range(from, from + 999);
  if (error) throw new Error(error.message);
  all.push(...(data as M[]));
  if (!data || data.length < 1000) break;
}

// 답마다 바로 앞의 사람 말로 언어를 정한다(사람이 영어로 말했으면 영어로 답해야 한다).
const lastUser = new Map<string, string>();
const rows: { lang: "en" | "ko"; text: string }[] = [];
for (const m of all) {
  const k = m.user_id + m.character_id;
  if (m.role === "user") { lastUser.set(k, m.content ?? ""); continue; }
  if (m.role !== "character" || !m.content) continue;
  const u = lastUser.get(k);
  if (u === undefined) continue;                       // 먼저 말 걸기는 언어를 모른다 → 안 셈
  rows.push({ lang: hangulShare(u) < 0.1 ? "en" : "ko", text: m.content });
}

const AI_SELF = ["as an ai", "language model", "i'm an ai", "i am an ai", "인공지능", "ai 라서", "ai라서", "챗봇"];
const rules: { id: string; on: "en" | "ko" | "all"; fail: (t: string) => boolean }[] = [
  { id: "영어로 물었는데 한글이 섞임(>5%)", on: "en", fail: (t) => hangulShare(t) > 0.05 },
  { id: "한국어로 물었는데 영어로 답(한글<30%)", on: "ko", fail: (t) => hangulShare(t) < 0.3 },
  { id: "말풍선 3개 초과(줄 기준)", on: "all", fail: (t) => t.split("\n").filter((l) => l.trim()).length > 3 },
  { id: "말풍선 평균 30자 초과(한국어)", on: "ko", fail: (t) => { const b = splitBubbles(t); return b.reduce((s, x) => s + x.length, 0) / b.length > 30; } },
  { id: "말풍선 평균 12단어 초과(영어)", on: "en", fail: (t) => { const b = splitBubbles(t); return b.reduce((s, x) => s + x.split(/\s+/).filter(Boolean).length, 0) / b.length > 12; } },
  { id: "AI 자칭", on: "all", fail: (t) => AI_SELF.some((w) => t.toLowerCase().includes(w)) },
];

const en = rows.filter((r) => r.lang === "en").length, ko = rows.length - en;
console.log(`답 ${rows.length}개 (영어 ${en} · 한국어 ${ko}) · 메시지 전체 ${all.length}\n`);
let anyFail = 0;
const failedAny = new Set<number>();
for (const r of rules) {
  const pool = rows.map((x, i) => ({ x, i })).filter(({ x }) => r.on === "all" || x.lang === r.on);
  const f = pool.filter(({ x }) => r.fail(x.text));
  f.forEach(({ i }) => failedAny.add(i));
  console.log(`  ${(f.length / Math.max(1, pool.length) * 100).toFixed(1).padStart(5)}%  ${f.length}/${pool.length}  ${r.id}`);
  if (f[0]) console.log(`          예: ${JSON.stringify(f[0].x.text.slice(0, 70))}`);
}
anyFail = failedAny.size;
console.log(`\n하나라도 떨어진 답: ${anyFail}/${rows.length} = ${(anyFail / rows.length * 100).toFixed(1)}%`);
console.log("못 잰 것: 캐릭터다운가·재미있나 — 기계 자가 없다.");
