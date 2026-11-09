/**
 * # 일곱 명과 한 번씩 대화  (11-09 사장님: *"지금 채팅 한번씩 다 해봐"*)
 *
 *   npx tsx engine/tools/dot_chat_all.mts
 *   npx tsx engine/tools/dot_chat_all.mts --say "오늘 좀 힘들었어"
 *
 * 진짜 모델을 부른다(싼 자리). 보는 것은 셋:
 *
 * 1. **답이 오나** — 안 오면 까닭까지 적는다(열쇠·한도·모양 깨짐).
 * 2. **표정이 그림으로 이어지나** — 답이 고른 표정의 **스프라이트 주소를 두드려 본다.**
 *    표에 적힌 것과 열리는 것은 다르다(11-07 멘헤라 36장이 404였다). 오늘 테두리를 덮어썼으니 더욱.
 * 3. **얼마나 걸리나 · 친밀도가 움직이나**.
 *
 * 앞선 흔적은 사람마다 지우고 시작한다 — 친밀도가 쌓여 있으면 첫 마디 대접이 달라진다.
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { runDotTurn } = await import("../../src/lib/dot/turn");

const 끌 = (이름: string) => { const i = process.argv.indexOf(이름); return i > 0 ? process.argv[i + 1] : undefined; };
const 할말 = 끌("--say") ?? "안녕! 오늘 처음 말 걸어 봐. 뭐 하고 있었어?";
const db = createServiceClient();

/**
 * 시험 계정은 **그때그때 만들고 끝나면 지운다.**
 * 예전에 박아 둔 uid 는 DB 이사 때 사라졌고(`dot_usage_user_id_fkey` 위반), 그걸 7번 되풀이해
 * 맞았다. 박아 둔 번호는 언제든 남의 DB 가 된다. `--keep` 이면 남긴다.
 */
const 남길까 = process.argv.includes("--keep");
const 메일 = `chatall-${Date.now()}@dugeun.local`;
const { data: 만든것, error: 만들다실패 } = await db.auth.admin.createUser({ email: 메일, password: `t-${Math.random().toString(36).slice(2)}!`, email_confirm: true });
if (만들다실패 || !만든것?.user) { console.error(`시험 계정을 못 만들었다: ${만들다실패?.message}`); process.exit(1); }
const USER = 만든것.user.id;
console.log(`시험 계정 ${USER} (${메일})${남길까 ? "" : " — 끝나면 지운다"}`);

/**
 * **하트를 먼저 채운다.** 새 계정은 하트가 0 이다(`AUTO_HEARTS_PER_DAY = 0`) — 출석(5개)이나
 * 광고로만 들어온다. 그래서 그냥 말을 걸면 일곱 명 전부 `limit` 이 뜬다. 고장이 아니라 설계다.
 * 여기서는 **출석 한 번(5개)** 을 흉내 내고, 일곱 명을 다 보려면 두 개가 모자라므로 지갑에
 * 시험용 크레딧을 얹는다. 사람이 쓰는 길을 바꾸는 게 아니라 **시험 계정에만** 넣는 것이다.
 */
const { todayKST, CHECKIN_HEARTS } = await import("../../src/lib/dot/bond");
const 오늘 = todayKST();
await db.from("dot_usage").upsert({ user_id: USER, day: 오늘, turns: 0, bonus_turns: CHECKIN_HEARTS, ad_refills: 0 }, { onConflict: "user_id,day" });
await db.from("dot_wallet").upsert({ user_id: USER, credits: 10 }, { onConflict: "user_id" });
const { data, error } = await db.from("dot_characters").select("id, slug, name, sprites, is_public").eq("is_public", true).order("slug");
if (error) { console.error(`표를 못 읽었다: ${error.message}`); process.exit(1); }

console.log(`일곱 명과 한 번씩 — "${할말}"\n`);
type 줄 = { 이름: string; 됨: boolean; 표정: string; 그림: string; 초: number; 친밀도: string; 말: string };
const 줄들: 줄[] = [];
for (const c of data as any[]) {
  await db.from("dot_messages").delete().eq("user_id", USER).eq("character_id", c.id);
  await db.from("dot_bonds").delete().eq("user_id", USER).eq("character_id", c.id);
  const t0 = Date.now();
  const r: any = await runDotTurn(db, USER, c.id, 할말);
  const 초 = (Date.now() - t0) / 1000;
  if (!r.ok) {
    줄들.push({ 이름: c.name, 됨: false, 표정: "-", 그림: "-", 초, 친밀도: "-", 말: `${r.reason} ${r.message ?? ""}`.trim() });
    console.log(`${c.name} ❌ ${r.reason} ${r.message ?? ""}`);
    continue;
  }
  /* 표정이 가리키는 그림을 **두드려 본다** */
  const url = (c.sprites as Record<string, string>)[r.emotion];
  let 그림 = "주소 없음";
  if (url) {
    try { const h = await fetch(url, { method: "GET", headers: { range: "bytes=0-0" } }); 그림 = h.ok ? "열림" : `${h.status}`; }
    catch (e) { 그림 = "못 두드림"; }
  }
  줄들.push({ 이름: c.name, 됨: true, 표정: r.emotion, 그림, 초, 친밀도: `${r.bond.points}점(+${r.bond.gained}) ${r.bond.stage}단계`, 말: r.reply });
  console.log(`── ${c.name} (${c.slug})`);
  console.log(`   ${r.reply}`);
  console.log(`   표정 ${r.emotion} · 그림 ${그림} · ${r.bond.points}점(+${r.bond.gained}) ${r.bond.stage}단계 · 남은 ${r.remaining}턴 · ${초.toFixed(1)}s\n`);
}

console.log(`이름   답   표정        그림    걸린시간`);
for (const x of 줄들) {
  console.log(`${x.이름.padEnd(5)} ${x.됨 ? "✅" : "❌"}  ${x.표정.padEnd(10)} ${x.그림.padEnd(6)} ${x.초.toFixed(1)}s`);
}
const 안된것 = 줄들.filter((x) => !x.됨), 그림깨짐 = 줄들.filter((x) => x.됨 && x.그림 !== "열림");
console.log(`\n답한 사람 ${줄들.length - 안된것.length}/${줄들.length} · 그림 열린 사람 ${줄들.filter((x) => x.그림 === "열림").length}/${줄들.length}`);
if (안된것.length) console.log(`  답 못 한 사람: ${안된것.map((x) => `${x.이름}(${x.말})`).join(", ")}`);
if (그림깨짐.length) console.log(`  그림이 안 열린 사람: ${그림깨짐.map((x) => `${x.이름} ${x.표정} ${x.그림}`).join(", ")}`);

if (!남길까) {
  const { error: e } = await db.auth.admin.deleteUser(USER);
  console.log(e ? `\n시험 계정을 못 지웠다: ${e.message} (uid ${USER})` : `\n시험 계정 지움`);
}
