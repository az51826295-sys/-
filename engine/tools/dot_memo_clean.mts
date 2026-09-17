/** 운영 기억 청소 — 문(memo.ts)을 지금 있는 기억에 거꾸로 적용한다. 사용자 말 전체와 대조해 근거 없는 것만 뺀다. */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) { const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0,i).trim()] ||= l.slice(i+1).trim(); }
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { support, mergeMemo, MIN_SUPPORT } = await import("../../src/lib/dot/memo");
const db = createServiceClient();
const { data: bonds } = await db.from("dot_bonds").select("user_id, character_id, memo");
for (const b of (bonds ?? []) as { user_id: string; character_id: string; memo: string[] }[]) {
  if (!Array.isArray(b.memo) || b.memo.length === 0) continue;
  const { data: msgs } = await db.from("dot_messages").select("content").eq("user_id", b.user_id).eq("character_id", b.character_id).eq("role", "user");
  // 대화 **전체**와 대조하면 "게임·좋아·개발" 같은 흔한 낱말이 어디선가 걸려 지어낸 것도 통과한다(첫 판이 그랬다).
  // 기억은 "방금 한 말" 에서 나온 것이므로 **한 문장 단위**로 대조한다 — 어느 한 마디가 뒷받침해야 남긴다.
  const lines = ((msgs ?? []) as { content: string }[]).map((m) => m.content);
  const best = (f: string) => lines.reduce((mx, l) => Math.max(mx, support(f, l)), 0);
  let next: string[] = []; const dropped: string[] = [];
  for (const f of b.memo) {
    if (best(f) < MIN_SUPPORT) { dropped.push(f); continue; }
    next = mergeMemo(next, f, lines.join(" ")).memo;   // 같은 얘기는 접힌다
  }
  if (dropped.length || next.length !== b.memo.length) {
    await db.from("dot_bonds").update({ memo: next }).eq("user_id", b.user_id).eq("character_id", b.character_id);
    console.log(`${b.character_id.slice(0,8)}: ${b.memo.length} → ${next.length}개 · 근거 없어 뺀 것 ${dropped.length}: ${JSON.stringify(dropped)}`);
    console.log(`   남긴 것: ${JSON.stringify(next)}`);
  }
}
console.log("끝");
