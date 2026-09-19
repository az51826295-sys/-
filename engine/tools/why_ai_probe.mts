// 184회차: "왜 이 AI인가" 줄 자 — 모델 이름이 새지 않는가, 세 경우(채우는 중·탐색·최고) 모두. 돈 0.
const { whyForPerson, seatRecords, fixCandidates, pickFixSeat } = await import("../../src/lib/skills/appBuild/seats");
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const rec = await seatRecords(db, fixCandidates());
const fat = rec.map((r, i) => ({ ...r, n: 8, judged: 8, ok: 7 - i, loopSeen: 8, loopClean: 8 - i, usd: 0.005 + i * 0.002, score: (7 - i) / 8 }));
const cases = [
  ["채우는 중", whyForPerson({ model: rec[0].model, why: "기록", records: rec, explored: true })],
  ["탐색", whyForPerson({ model: fat[1].model, why: "섞어", records: fat, explored: true })],
  ["최고", whyForPerson({ model: fat[0].model, why: "성적", records: fat, explored: false })],
  ["박아 둠", whyForPerson({ model: "gpt-5.6-luna", why: "FIX_SEAT_MODEL 로 박아 둔 자리", records: [], explored: false })],
  ["실제 지금", whyForPerson(await pickFixSeat(db))],
] as const;
const leak = /gpt|deepseek|luna|flash|claude|gemini|openai|v4/i;
let bad = 0;
for (const [name, line] of cases) { const ok = !leak.test(line); if (!ok) bad++; console.log(ok ? "맞음  " : "어긋남", name, "→", line); }
console.log(bad ? `모델 이름이 샌 줄 ${bad}개` : "모델 이름 샘 0");
