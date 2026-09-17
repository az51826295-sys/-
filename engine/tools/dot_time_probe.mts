/**
 * 시간 힌트 자 (94회차 09-13) — 09-13 새벽 1시 린이 네 답 연속 새벽 타령 + "…밥은 먹었어." (물음표 없음).
 *   [순수, 모델 없음] timeHint: (1) 새벽엔 밥 얘기 금지·잠은 한 번  (2) 점심·저녁엔 밥 허용  (3) 오후엔 시각만
 *                    (4) 방금 답에 시간 얘기가 있으면 "꺼내지 마라"
 *   [모델, 린 5턴] 짧은 대답("멍쿠","앱 개발한다고","음","응","그냥") 에 (5) 시간·잠·밥 언급 ≤ 2/5 턴
 *                    (6) 물음표 없는 물음("…먹었어." "…했어." 로 끝나는 짧은 문장) 0개
 *   모델 부분은 --model 을 줄 때만 돈다. 시험 계정은 끝에 지운다.
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) { const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0,i).trim()] = l.slice(i+1).trim(); }
const { timeHint, TIME_TALK } = await import("../../src/lib/dot/bond");
const lines: [boolean, string][] = [];
const kst = (h: number) => new Date(Date.UTC(2026, 8, 13, h - 9, 6));   // 한국 h시 06분
const dawn = timeHint(kst(1), []), noon = timeHint(kst(12), []), eve = timeHint(kst(19), []), pm = timeHint(kst(15), []), night = timeHint(kst(23), []);
lines.push([/새벽/.test(dawn) && !/밥/.test(dawn) && /잠 얘기는 한 번/.test(dawn), `새벽 1시(밥 얘기 없음): ${dawn}`]);
lines.push([/밥/.test(noon) && !/하지 마라/.test(noon) && /밥/.test(eve), `점심·저녁: ${noon} / ${eve}`]);
lines.push([!/밥|잠|잘 자/.test(pm) && /15시/.test(pm), `오후 3시(시각만): ${pm}`]);
lines.push([/잘 자/.test(night), `밤 11시: ${night}`]);
const again = timeHint(kst(1), ["어, 멍쿠. 새벽 1시에 안 자고 뭐 해."]);
lines.push([/꺼내지 말고/.test(again) && !/잠 얘기는 한 번/.test(again), `방금 시간 얘기 했으면: ${again}`]);
lines.push([TIME_TALK.test("…밥은 먹었어.") && TIME_TALK.test("너 또 잠 깎아먹게") === false && TIME_TALK.test("오늘도 밤 새는 거야"), `시간 낱말 자: 밥 ✓ · 밤 새 ✓ · "잠 깎아" 는 잡지 않음(잡을 필요 없음)`]);

if (process.argv.includes("--model")) {
  process.env.AI_PROVIDER = "deepseek";
  const { createServiceClient } = await import("../../src/lib/supabase/service");
  const { streamDotTurn } = await import("../../src/lib/dot/turn");
  const db = createServiceClient();
  const { data: made, error } = await db.auth.admin.createUser({ email: `time-${Date.now()}@dugeun.local`, password: "time-pass-0913!", email_confirm: true }); if (error) throw error;
  const uid = made.user.id;
  try {
    const { data: ch } = await db.from("dot_characters").select("id").eq("slug", "rin").maybeSingle();
    const cid = ch!.id as string;
    const SAYS = ["멍쿠", "앱 개발한다고", "음", "응", "그냥"];
    const out: string[] = [];
    for (const s of SAYS) { let t = ""; const r = await streamDotTurn(db, uid, cid, s, (c) => { t += c; }); if (!r.ok) throw new Error(JSON.stringify(r)); out.push(t); }
    const timed = out.filter((r) => TIME_TALK.test(r) || /\d+시/.test(r)).length;
    lines.push([timed <= 2, `시간·잠·밥 언급 ${timed}/5 턴 (≤2) — ${out.map((r) => `"${r.slice(0, 28)}"`).join(" ")}`]);
    // 물음표 없는 물음: "…먹었어." "…했어." "…괜찮아." 로 끝나는 짧은 문장(8자 이하) — 린의 시큰둥 서술문("밤 새는 거야.")은 길어서 안 잡힌다.
    const dropped = out.flatMap((r) => r.split(/(?<=[.!?…])\s+/u)).filter((s) => /^[^.?!]{1,8}(먹었|잤|했|괜찮|있)어\.$/u.test(s.trim()));
    lines.push([dropped.length === 0, `물음표 빠진 물음 ${dropped.length}개 ${dropped.length ? JSON.stringify(dropped) : ""}`]);
  } finally { await db.auth.admin.deleteUser(uid).catch(() => {}); }
}
for (const [ok, s] of lines) console.log(`  ${ok ? "✅" : "❌"} ${s}`);
console.log(lines.every(([ok]) => ok) ? "모두 통과" : "떨어진 줄 있음");
process.exit(lines.every(([ok]) => ok) ? 0 : 1);
