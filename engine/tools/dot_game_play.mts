/**
 * # 놀이를 **진짜로 한 판씩** 돌려 본다 (11-09)
 *
 *   npx tsx engine/tools/dot_game_play.mts            ← 넷 다
 *   npx tsx engine/tools/dot_game_play.mts 끝말잇기
 *
 * 모델을 실제로 부르고 하트도 실제로 쓴다(시험 계정). 보는 것:
 * ① 판이 열리나 ② 규칙에 걸린 수를 **하트 안 쓰고** 막나 ③ 끝이 제대로 적히나.
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { playGameTurn } = await import("../../src/lib/dot/gameTurn");
const { GAMES, GAME_LABEL, GAME_END } = await import("../../src/lib/dot/games");
type GameKey = (typeof GAMES)[number];
const { todayKST, CHECKIN_HEARTS } = await import("../../src/lib/dot/bond");

const db = createServiceClient();
const 고른것 = (process.argv[2] ? [process.argv[2]] : [...GAMES]) as GameKey[];
const { data: c } = await db.from("dot_characters").select("id, name").eq("slug", "rin").single();

const 메일 = `gameplay-${Date.now()}@dugeun.local`;
const { data: 만든것, error: e1 } = await db.auth.admin.createUser({ email: 메일, password: `t-${Math.random().toString(36).slice(2)}!`, email_confirm: true });
if (e1 || !만든것?.user) { console.error(`시험 계정을 못 만들었다: ${e1?.message}`); process.exit(1); }
const USER = 만든것.user.id;
await db.from("dot_usage").upsert({ user_id: USER, day: todayKST(), turns: 0, bonus_turns: CHECKIN_HEARTS, ad_refills: 0 }, { onConflict: "user_id,day" });
await db.from("dot_wallet").upsert({ user_id: USER, credits: 80 }, { onConflict: "user_id" });

const 적은것: string[] = [];
const 남은하트 = async () => {
  const { data } = await db.from("dot_wallet").select("credits").eq("user_id", USER).maybeSingle();
  return Number(data?.credits ?? 0);
};

for (const game of 고른것) {
  console.log(`\n── ${GAME_LABEL[game]}`);
  const 시작 = await playGameTurn(db, USER, c!.id as string, { game });
  if (!시작.ok) { 적은것.push(`❌ ${game} 판이 안 열린다: ${(시작 as any).message ?? (시작 as any).reason}`); continue; }
  console.log(`  ${c!.name}: ${시작.reply.replace(/\n/g, " / ")}`);
  적은것.push(`✅ ${GAME_LABEL[game]} 판이 열린다`);

  if (game === "끝말잇기") {
    /* 심은 고장 — 첫 글자가 틀린 수. 하트가 줄면 안 된다. */
    const 전 = await 남은하트();
    const 막힘 = await playGameTurn(db, USER, c!.id as string, { message: "바나나" });
    const 후 = await 남은하트();
    const 막았나 = !막힘.ok && (막힘 as any).reason === "규칙";
    적은것.push(막았나 ? `✅ 틀린 수를 막는다 (${(막힘 as any).message})` : `❌ 틀린 수가 지나갔다`);
    적은것.push(전 === 후 ? `✅ 막힌 수엔 하트를 안 쓴다 (${전}→${후})` : `❌ 막힌 수에 하트가 줄었다 (${전}→${후})`);
  }

  /* 한 수 더 — 놀이마다 사람이 할 법한 말.
     끝말잇기는 **캐릭터가 방금 낸 낱말의 끝 글자**로 만들어야 한다(코드는 사전을 안 보므로
     규칙만 맞으면 지나간다 — 여기서 보는 것은 배관이지 낱말 실력이 아니다). */
  const 첫줄 = 시작.reply.split("\n")[0].trim();
  const 끝글자 = [...첫줄][[...첫줄].length - 1] ?? "";
  const 할말: Record<GameKey, string> = {
    끝말잇기: `${끝글자}바람`, 스무고개: "그거 먹는 거야?", 두진실한거짓: "2번이 거짓 같은데", 초성퀴즈: "학교",
  };
  const 다음 = await playGameTurn(db, USER, c!.id as string, { message: 할말[game] });
  if (!다음.ok) { 적은것.push(`❌ ${game} 한 수를 못 뒀다: ${(다음 as any).message ?? (다음 as any).reason}`); continue; }
  console.log(`  나: ${할말[game]}`);
  console.log(`  ${c!.name}: ${다음.reply.replace(/\n/g, " / ")}`);
  적은것.push(`✅ ${GAME_LABEL[game]} 한 수가 돈다`);
  if (game === "두진실한거짓" || game === "초성퀴즈") {
    적은것.push(다음.reply.includes(GAME_END) || game === "초성퀴즈" ? `✅ 채점이 돈다` : `❌ 채점에서 안 끝난다`);
  }
}

await db.auth.admin.deleteUser(USER);
console.log(`\n${적은것.join("\n")}`);
process.exit(적은것.some((s) => s.startsWith("❌")) ? 1 : 0);
