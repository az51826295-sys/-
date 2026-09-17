/**
 * 글 모양 자 (96회차 09-13, 사장님 "현실성 추가") — 카톡 사람처럼 보이는가를 숫자로.
 *   [순수] splitBubbles: 줄바꿈 나누기·빈 줄 버림·넷째는 셋째에 붙임
 *   [모델, 린·유나 각 4턴] (1) 말풍선로 끝나는 마침표 비율 ≤ 10%  (2) 한 답의 말풍선 1~3개  (3) 말풍선 평균 ≤ 30자
 *                          (4) 두 개 이상으로 나뉜 답 ≥ 30%
 *   기준선(09-13 01:40, 고치기 전 실서버 최근 40줄): 마침표 19/40, 평균 44자, 나뉨 8/40.
 *   --model 을 줄 때만 모델을 부른다. 시험 계정은 끝에 지운다.
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) { const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0,i).trim()] = l.slice(i+1).trim(); }
const { splitBubbles, tidyReply } = await import("../../src/lib/dot/bubbles");
const lines: [boolean, string][] = [];
const a = splitBubbles("ㅇㅇ\n근데 이 시간에 뭐해");
lines.push([a.length === 2 && a[0] === "ㅇㅇ", `줄바꿈 나누기 ${JSON.stringify(a)}`]);
const b = splitBubbles("하나\n\n\n둘\n");
lines.push([b.length === 2 && b[1] === "둘", `빈 줄 버림 ${JSON.stringify(b)}`]);
const c = splitBubbles("1\n2\n3\n4\n5");
lines.push([c.length === 3 && c[2] === "3 4 5", `넷째부터 셋째에 ${JSON.stringify(c)}`]);
const t = tidyReply("어, 멍쿠.\n왜.\n그래서… 진짜?");
lines.push([t === "어, 멍쿠\n왜\n그래서… 진짜?", `마침표 떼기(말줄임·물음표는 둠) ${JSON.stringify(t)}`]);
lines.push([splitBubbles("한 덩어리").length === 1 && splitBubbles("   ").length === 1, `한 줄·빈 글도 한 개`]);

if (process.argv.includes("--model")) {
  process.env.AI_PROVIDER = "deepseek";
  const { createServiceClient } = await import("../../src/lib/supabase/service");
  const { streamDotTurn } = await import("../../src/lib/dot/turn");
  const db = createServiceClient();
  const { data: made, error } = await db.auth.admin.createUser({ email: `shape-${Date.now()}@dugeun.local`, password: "shape-pass-0913!", email_confirm: true }); if (error) throw error;
  const uid = made.user.id;
  try {
    const SAYS = ["안녕 나 멍쿠야", "오늘 회사에서 혼났어", "그래도 저녁에 치킨 먹을 거야", "너는 뭐 하고 있었어?"];
    const replies: string[] = [];
    for (const slug of ["rin", "yuna"]) {
      const { data: ch } = await db.from("dot_characters").select("id").eq("slug", slug).maybeSingle();
      for (const s of SAYS) { let t = ""; const r = await streamDotTurn(db, uid, ch!.id as string, s, (c) => { t += c; }); if (!r.ok) throw new Error(JSON.stringify(r)); replies.push(t); }
    }
    const bubbles = replies.flatMap((r) => splitBubbles(tidyReply(r)));
    const period = bubbles.filter((x) => /[.。]$/.test(x)).length;
    const counts = replies.map((r) => splitBubbles(r).length);
    const leaked = replies.filter((r) => /밥 얘기|지시|괄호|시간에 맞는/.test(r)).length;
    lines.push([leaked === 0, `지시문이 말에 샘 ${leaked}개`]);
    const avg = bubbles.reduce((n, x) => n + x.length, 0) / bubbles.length;
    const multi = counts.filter((n) => n >= 2).length;
    lines.push([period / bubbles.length <= 0.1, `마침표로 끝난 말풍선 ${period}/${bubbles.length} (≤10%)`]);
    lines.push([counts.every((n) => n >= 1 && n <= 3), `한 답의 말풍선 수 ${counts.join(",")} (1~3)`]);
    lines.push([avg <= 30, `말풍선 평균 ${avg.toFixed(1)}자 (≤30)`]);
    lines.push([multi / replies.length >= 0.3, `두 개 이상으로 나뉜 답 ${multi}/${replies.length} (≥30%)`]);
    for (const r of replies) console.log("   · " + r.replace(/\n/g, " ⏎ "));
  } finally { await db.auth.admin.deleteUser(uid).catch(() => {}); }
}
for (const [ok, s] of lines) console.log(`  ${ok ? "✅" : "❌"} ${s}`);
console.log(lines.every(([ok]) => ok) ? "모두 통과" : "떨어진 줄 있음");
process.exit(lines.every(([ok]) => ok) ? 0 : 1);
