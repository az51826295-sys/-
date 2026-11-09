/**
 * # 타로 한 판 돌려 보기  (11-09)
 *
 *   npx tsx engine/tools/dot_tarot_test.mts --sabotage   ← 자가 지어낸 말을 잡나
 *   npx tsx engine/tools/dot_tarot_test.mts              ← 진짜 대화로 한 판 (싼 자리 모델)
 *   npx tsx engine/tools/dot_tarot_test.mts --only rin --turns 10
 *
 * 화면은 아직 없다. 터미널에서 **말이 되는지** 먼저 본다.
 * 시험 계정은 그때그때 만들고 지운다 — 박아 둔 uid 는 DB 이사 때 사라진다.
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { drawCards, checkReading, pullTarot, 카드이름, DECK, SPOTS } = await import("../../src/lib/dot/tarot");
const { todayKST, CHECKIN_HEARTS, stageFor } = await import("../../src/lib/dot/bond");
const { runDotTurn } = await import("../../src/lib/dot/turn");

const 끌 = (이름: string) => { const i = process.argv.indexOf(이름); return i > 0 ? process.argv[i + 1] : undefined; };
const db = createServiceClient();

/* ── 자 시험: 지어낸 근거를 잡나 · 진짜 근거를 통과시키나 ── */
if (process.argv.includes("--sabotage")) {
  const 대화 = [
    { role: "user", content: "오늘 알바에서 손님한테 혼났어" },
    { role: "character", content: "아이고... 많이 속상했겠다" },
    { role: "user", content: "그래도 끝나고 떡볶이 먹었다" },
    { role: "character", content: "잘했네. 매운 거 먹으면 좀 풀리지" },
  ];
  const 뼈대 = { 뽑기: drawCards("u", "c", 2), 카드말: SPOTS.map((자리) => ({ 자리, 한줄: "짧은 한 줄" })), 관계: "가까워지는 중이야." };
  const 진짜 = { ...뼈대, 근거: ["손님한테 혼났어", "떡볶이 먹었다"] };
  const 지어냄 = { ...뼈대, 근거: ["지난주에 이사했다고 했잖아", "고양이 얘기 많이 했지"] };
  const 반쯤 = { ...뼈대, 근거: ["떡볶이 먹었다", "시험 망쳤다고 했잖아"] };
  for (const [이름, r] of [["진짜 근거", 진짜], ["지어낸 근거", 지어냄], ["반쯤 지어냄", 반쯤]] as const) {
    const v = checkReading(r as any, 대화);
    console.log(`  ${이름.padEnd(7)} 적중 ${(v.근거적중 * 100).toFixed(0).padStart(3)}% → ${v.맞나 ? "통과" : `막음 (${v.어긴것.join(" · ")})`}`);
  }
  const a = checkReading(진짜 as any, 대화), b = checkReading(지어냄 as any, 대화), c2 = checkReading(반쯤 as any, 대화);
  const 맞나 = a.맞나 && !b.맞나 && !c2.맞나;
  console.log(맞나 ? `  ✅ 자가 가른다` : `  ❌ 자가 못 가른다 — 이 자는 못 쓴다`);

  /* 뽑기가 정말 정해져 있나 · 겹치지 않나 */
  const d1 = drawCards("u", "c", 3), d2 = drawCards("u", "c", 3), d3 = drawCards("u", "c", 4);
  const 같나 = JSON.stringify(d1) === JSON.stringify(d2);
  const 다르나 = JSON.stringify(d1) !== JSON.stringify(d3);
  const 안겹침 = new Set(d1.map((x) => x.카드)).size === 3 && d1.every((x) => (DECK as readonly string[]).includes(x.카드));
  console.log(`  뽑기 — 같은 단계면 같은 패 ${같나 ? "✅" : "❌"} · 단계가 다르면 다른 패 ${다르나 ? "✅" : "❌"} · 세 장 안 겹침 ${안겹침 ? "✅" : "❌"}`);
  process.exit(맞나 && 같나 && 다르나 && 안겹침 ? 0 : 1);
}

/* ── 진짜 한 판: 시험 계정을 만들고 몇 마디 나눈 뒤 뽑는다 ── */
const slug = 끌("--only") ?? "rin";
const 턴수 = Number(끌("--turns") ?? 6);
const { data: c } = await db.from("dot_characters")
  .select("id, slug, name, persona, speech, formal_start, voice_ladder").eq("slug", slug).single();
if (!c) { console.error(`${slug} 를 못 찾았다`); process.exit(1); }

const 메일 = `tarot-${Date.now()}@dugeun.local`;
const { data: 만든것, error: 만들기 } = await db.auth.admin.createUser({ email: 메일, password: `t-${Math.random().toString(36).slice(2)}!`, email_confirm: true });
if (만들기 || !만든것?.user) { console.error(`시험 계정을 못 만들었다: ${만들기?.message}`); process.exit(1); }
const USER = 만든것.user.id;
await db.from("dot_usage").upsert({ user_id: USER, day: todayKST(), turns: 0, bonus_turns: CHECKIN_HEARTS, ad_refills: 0 }, { onConflict: "user_id,day" });
await db.from("dot_wallet").upsert({ user_id: USER, credits: 40 }, { onConflict: "user_id" });

/** 사람이 할 법한 말 — 타로가 **이 대화에서** 뭘 집어내는지 보려고 일부러 사연을 둔다. */
const 할말 = [
  "안녕! 나 오늘 처음 말 걸어 봐",
  "요즘 시험 기간이라 잠을 못 자",
  "어제는 공부하다가 새벽 세 시에 라면 끓여 먹었어",
  "사실 나 수학이 제일 싫어",
  "너는 밤에 뭐 해? 나처럼 안 자?",
  "오늘은 좀 일찍 자 볼까 해",
  "근데 너랑 얘기하면 시간 가는 줄 모르겠다",
  "다음 주에 시험 끝나면 뭐 하지",
];
console.log(`${c.name} 와 ${턴수}턴 나눈 뒤 뽑는다 (시험 계정 ${USER.slice(0, 8)})`);
for (const m of 할말.slice(0, 턴수)) {
  const r: any = await runDotTurn(db, USER, c.id as string, m);
  if (!r.ok) { console.log(`  ❌ ${r.reason} ${r.message ?? ""}`); break; }
  console.log(`  나 → ${m}\n  ${c.name} → ${r.reply.split("\n")[0]}  (${r.bond.points}점 ${r.bond.stage}단계)`);
}

const { data: bond } = await db.from("dot_bonds").select("points").eq("user_id", USER).eq("character_id", c.id).maybeSingle();
const 단계 = stageFor(Number(bond?.points ?? 0));
const 패 = drawCards(USER, c.id as string, 단계);
console.log(`\n${단계}단계 · 패: ${패.map((d) => `${d.자리} ${카드이름(d)}`).join(" / ")}`);

const t0 = Date.now();
const r = await pullTarot(db, USER, c as any);
console.log(`(${((Date.now() - t0) / 1000).toFixed(1)}s)`);
if (!r.ok) console.log(`❌ 못 냈다: ${r.why}`);
else {
  for (const x of r.reading.카드말) {
    const d = r.reading.뽑기.find((y) => y.자리 === x.자리);
    console.log(`\n[${x.자리}] ${d ? 카드이름(d) : "?"}\n  ${x.한줄}`);
  }
  console.log(`\n${r.reading.관계}`);
  console.log(`\n근거 ${(r.검사.근거적중 * 100).toFixed(0)}% 적중 · ${r.판}판째에 통과`);
  for (const g of r.reading.근거) console.log(`  · ${g}`);
}

await db.auth.admin.deleteUser(USER);
console.log(`\n시험 계정 지움`);
