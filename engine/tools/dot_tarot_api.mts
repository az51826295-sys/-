/**
 * # 타로 API 가 **화면이 읽는 칸**을 주는가  (11-10 사장님: *"그 게임에 타로도 올려"*)
 *
 *   npx tsx engine/tools/dot_tarot_api.mts                       ← 배포된 곳
 *   npx tsx engine/tools/dot_tarot_api.mts --at http://localhost:3000
 *
 * 놀이 서랍에 올린 타로 단추는 GET 의 `사람들[].뽑을수있나 · 단계 · 점수` 와
 * POST 의 `적은것` 을 읽는다. 칸 이름이 하나만 달라도 **단추가 조용히 안 뜬다** —
 * 화면은 오류를 안 내고 그냥 비어 있다. 그래서 칸을 직접 두드린다.
 *
 * 진짜 사람처럼 **Bearer 토큰**으로 부른다(앱이 쓰는 길). 시험 계정은 만들고 지운다.
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
const { createClient } = await import("@supabase/supabase-js");
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { runDotTurn } = await import("../../src/lib/dot/turn");
const { todayKST, CHECKIN_HEARTS } = await import("../../src/lib/dot/bond");

const 끌 = (이름: string) => { const i = process.argv.indexOf(이름); return i > 0 ? process.argv[i + 1] : undefined; };
const 집 = 끌("--at") ?? "https://dot-web-production-7e03.up.railway.app";
const db = createServiceClient();

const 메일 = `tarot-${Date.now()}@dugeun.local`, 비밀 = `t-${Math.random().toString(36).slice(2)}!A1`;
const { data: 만든것, error: 만들다실패 } = await db.auth.admin.createUser({ email: 메일, password: 비밀, email_confirm: true });
if (만들다실패 || !만든것?.user) { console.error(`시험 계정을 못 만들었다: ${만들다실패?.message}`); process.exit(1); }
const USER = 만든것.user.id;

const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
const { data: 들어감, error: 못들어감 } = await anon.auth.signInWithPassword({ email: 메일, password: 비밀 });
if (못들어감 || !들어감.session) { console.error(`토큰을 못 받았다: ${못들어감?.message}`); process.exit(1); }
const 머리 = { authorization: `Bearer ${들어감.session.access_token}`, "content-type": "application/json" };
console.log(`${집} · 시험 계정 ${USER}\n`);

const 결과: boolean[] = [];
const 재기 = (무엇: string, 맞음: boolean, 본것: string) => { 결과.push(맞음); console.log(`${맞음 ? "맞음" : "틀림"}  ${무엇} — ${본것}`); };

/* 말을 한 번 섞어야 카드가 열린다(점수 0 이면 지어낼 수밖에 없어서 서버가 막는다). */
await db.from("dot_usage").upsert({ user_id: USER, day: todayKST(), turns: 0, bonus_turns: CHECKIN_HEARTS, ad_refills: 0 }, { onConflict: "user_id,day" });
const { data: chars } = await db.from("dot_characters").select("id, slug, name").eq("is_public", true).order("slug");
const 그사람 = (chars as any[])[0];
/* 카드는 대화가 MIN_LINES 줄은 돼야 읽힌다 — 두 턴을 섞는다. */
let 턴됨 = 0;
for (const 말 of ["안녕! 오늘 학교에서 좀 힘든 일이 있었어. 그래도 네 생각하니까 괜찮아졌다.", "시험이 다음 주인데 하나도 손에 안 잡혀. 너는 어떻게 버텨?"]) {
  const t: any = await runDotTurn(db, USER, 그사람.id, 말);
  if (t.ok) 턴됨++;
}
재기("말이 섞인다(카드가 열리는 조건)", 턴됨 === 2, `${그사람.name} 와 ${턴됨}턴`);

/* **아직 모자랄 때**도 본다 — 목록과 뽑기의 문턱이 같아야 한다(11-10 에 여기가 어긋나 503 이었다). */
{
  const 짧은메일 = `tarot-short-${Date.now()}@dugeun.local`, 짧은비밀 = `t-${Math.random().toString(36).slice(2)}!A1`;
  const { data: 짧은것 } = await db.auth.admin.createUser({ email: 짧은메일, password: 짧은비밀, email_confirm: true });
  const 짧은USER = 짧은것!.user!.id;
  await db.from("dot_usage").upsert({ user_id: 짧은USER, day: todayKST(), turns: 0, bonus_turns: CHECKIN_HEARTS, ad_refills: 0 }, { onConflict: "user_id,day" });
  await runDotTurn(db, 짧은USER, 그사람.id, "안녕");
  const s2 = await createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
    .auth.signInWithPassword({ email: 짧은메일, password: 짧은비밀 });
  const 짧은머리 = { authorization: `Bearer ${s2.data.session!.access_token}`, "content-type": "application/json" };
  const gs = await fetch(`${집}/api/dot/tarot`, { headers: 짧은머리, cache: "no-store" as any });
  const 짧은내것 = ((await gs.json()).사람들 ?? []).find((x: any) => x.characterId === 그사람.id);
  const ps = await fetch(`${집}/api/dot/tarot`, { method: "POST", headers: 짧은머리, body: JSON.stringify({ characterId: 그사람.id }) });
  재기("대화가 모자라면 목록도 '못 뽑는다'", 짧은내것?.뽑을수있나 === false, `뽑을수있나=${짧은내것?.뽑을수있나} · 까닭="${짧은내것?.까닭 ?? ""}"`);
  재기("그때 뽑기도 막힌다(둘의 문턱이 같다)", ps.status !== 200, `POST ${ps.status}`);
  for (const tb of ["dot_messages", "dot_bonds", "dot_usage", "dot_wallet"]) await db.from(tb).delete().eq("user_id", 짧은USER);
  await db.auth.admin.deleteUser(짧은USER);
}

/* ── GET: 화면이 읽는 칸 ─────────────────────────────────────── */
const g = await fetch(`${집}/api/dot/tarot`, { headers: 머리, cache: "no-store" as any });
const gd: any = await g.json().catch(() => ({}));
const 내것 = (gd?.사람들 ?? []).find((x: any) => x.characterId === 그사람.id);
재기("GET 200 · 사람들 배열", g.ok && Array.isArray(gd?.사람들), `${g.status} · ${gd?.사람들?.length ?? 0}명`);
재기("내 캐릭터 줄이 있다", !!내것, 내것 ? `${내것.name}` : "없다");
재기("칸: 뽑을수있나 · 단계 · 점수", !!내것 && typeof 내것.뽑을수있나 === "boolean" && typeof 내것.단계 === "number" && typeof 내것.점수 === "number",
  내것 ? `뽑을수있나=${내것.뽑을수있나} 단계=${내것.단계} 점수=${내것.점수}` : "-");
재기("말을 섞었으니 뽑을 수 있다", 내것?.뽑을수있나 === true, `${내것?.뽑을수있나}`);

/* ── POST: 한 판 ────────────────────────────────────────────── */
const p = await fetch(`${집}/api/dot/tarot`, { method: "POST", headers: 머리, body: JSON.stringify({ characterId: 그사람.id }) });
const pd: any = await p.json().catch(() => ({}));
재기("POST 200 · ok", p.ok && pd?.ok === true, `${p.status} ${pd?.error ?? ""}${pd?.why ? ` · why=${JSON.stringify(pd.why)}` : ""}`);
재기("칸: 적은것(화면이 그대로 붙인다)", typeof pd?.적은것 === "string" && pd.적은것.startsWith("🔮 타로 · "),
  typeof pd?.적은것 === "string" ? pd.적은것.split(String.fromCharCode(10))[0] : "없다");
const { data: 남은것 } = await db.from("dot_messages").select("content").eq("user_id", USER).eq("character_id", 그사람.id).like("content", "🔮 타로 · %");
재기("대화에 한 줄로 남는다", (남은것 ?? []).length === 1, `${(남은것 ?? []).length}줄`);

/* ── 두 번째는 막힌다 ───────────────────────────────────────── */
const p2 = await fetch(`${집}/api/dot/tarot`, { method: "POST", headers: 머리, body: JSON.stringify({ characterId: 그사람.id }) });
const p2d: any = await p2.json().catch(() => ({}));
재기("같은 단계는 두 번 안 준다", p2.status === 429, `${p2.status} ${p2d?.error ?? ""}`);
const g2 = await fetch(`${집}/api/dot/tarot`, { headers: 머리, cache: "no-store" as any });
const 내것2 = ((await g2.json()).사람들 ?? []).find((x: any) => x.characterId === 그사람.id);
재기("그 뒤 GET 은 뽑을수있나=false", 내것2?.뽑을수있나 === false, `${내것2?.뽑을수있나}`);

if (!process.argv.includes("--keep")) {
  for (const tb of ["dot_messages", "dot_bonds", "dot_usage", "dot_wallet"]) await db.from(tb).delete().eq("user_id", USER);
  await db.auth.admin.deleteUser(USER);
}
const 틀린 = 결과.filter((x) => !x).length;
console.log(`\n${결과.length - 틀린}/${결과.length} 맞음`);
process.exit(틀린 ? 1 : 0);
