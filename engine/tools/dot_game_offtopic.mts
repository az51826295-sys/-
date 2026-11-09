/**
 * # 놀이 중 **뜬금없는 소리**를 센다  (11-09 사장님: *"왜 근데 뜬금없는 소리 잡아야 해"*)
 *
 *   npx tsx engine/tools/dot_game_offtopic.mts [판수]
 *
 * 끝말잇기를 하는데 "점심은 먹었어?", "이름 뭐야" 가 끼어들었다. 그 둘은 **대화를 이어 붙이려고
 * 넣어 둔 규칙**에서 나온다(이름 묻기 · 시간 힌트). 놀이 중에는 끄기로 했는데, 끈 것이 정말
 * 공이 있는지는 **켠 판과 나란히 돌려 봐야** 안다([[prompt-credit-needs-a-control]]).
 *
 * 세는 법: 캐릭터가 한 말을 줄 단위로 끊고, **놀이와 상관없는 안부/이름/시간 줄**을 센다.
 * 놀이 수(낱말·초성·예/아니오)는 세지 않는다.
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { playGameTurn } = await import("../../src/lib/dot/gameTurn");
const { todayKST, CHECKIN_HEARTS } = await import("../../src/lib/dot/bond");

/** 뜬금없는 줄 — 밥·시간·이름·잠. 놀이 한복판에서 나올 이유가 없는 것들. */
const 뜬금 = [
  { 이름: "밥", re: /밥은|점심|저녁|아침 먹|먹었어\?|배고/ },
  { 이름: "이름", re: /이름(이|은|뭐|을)|뭐라고 부/ },
  { 이름: "시간·잠", re: /몇 시|새벽|잘 자|안 자|잠은|자야/ },
];

function 세기(말: string): string[] {
  const 걸린것: string[] = [];
  for (const 줄 of 말.split("\n").map((s) => s.trim()).filter(Boolean)) {
    const m = 뜬금.find((x) => x.re.test(줄));
    if (m) 걸린것.push(`${m.이름}: ${줄}`);
  }
  return 걸린것;
}

const db = createServiceClient();
const 판수 = Number(process.argv[2] ?? 4);
const { data: c } = await db.from("dot_characters").select("id, name").eq("slug", "rin").single();

async function 한판(넛지켜기: boolean) {
  const 메일 = `offtopic-${넛지켜기 ? "on" : "off"}-${Date.now()}@dugeun.local`;
  const { data: u } = await db.auth.admin.createUser({ email: 메일, password: `t-${Math.random().toString(36).slice(2)}!`, email_confirm: true });
  const USER = u!.user.id;
  await db.from("dot_usage").upsert({ user_id: USER, day: todayKST(), turns: 0, bonus_turns: CHECKIN_HEARTS, ad_refills: 0 }, { onConflict: "user_id,day" });
  await db.from("dot_wallet").upsert({ user_id: USER, credits: 60 }, { onConflict: "user_id" });

  const 걸린것: string[] = [];
  let 줄수 = 0;
  const r0: any = await playGameTurn(db, USER, c!.id as string, { game: "끝말잇기", 넛지켜기 });
  if (r0.ok) { 줄수 += r0.reply.split("\n").filter(Boolean).length; 걸린것.push(...세기(r0.reply)); }
  let 앞말 = r0.ok ? r0.reply.split("\n")[0].trim() : "";
  for (let i = 0; i < 판수; i++) {
    const 끝글자 = [...앞말][[...앞말].length - 1] ?? "";
    const r: any = await playGameTurn(db, USER, c!.id as string, { message: `${끝글자}바람`, 넛지켜기 });
    if (!r.ok) break;
    줄수 += r.reply.split("\n").filter(Boolean).length;
    걸린것.push(...세기(r.reply));
    앞말 = r.reply.split("\n")[0].trim();
    if (r.reply.includes("판 끝")) break;
  }
  await db.auth.admin.deleteUser(USER);
  return { 걸린것, 줄수 };
}

const 켠것 = await 한판(true);
const 끈것 = await 한판(false);
const 적기 = (이름: string, r: { 걸린것: string[]; 줄수: number }) => {
  console.log(`${이름} — 캐릭터가 한 줄 ${r.줄수}개 중 **뜬금 ${r.걸린것.length}개** (${((r.걸린것.length / Math.max(1, r.줄수)) * 100).toFixed(0)}%)`);
  for (const s of r.걸린것) console.log(`   · ${s}`);
};
적기("넛지 켠 판(지금까지)", 켠것);
적기("넛지 끈 판(고친 뒤)", 끈것);
const 좋아졌나 = 끈것.걸린것.length < 켠것.걸린것.length;
console.log(`\n${좋아졌나 ? "✅ 줄었다" : "❌ 안 줄었다 — 넛지가 원인이 아니거나 더 봐야 한다"}`);
process.exit(좋아졌나 ? 0 : 1);
