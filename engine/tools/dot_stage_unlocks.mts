/**
 * # 단계 보상이 **진짜 잠겨 있나**  (11-10 사장님: *"호감도 3에는 배경화면, 5면 이모티콘"*)
 *
 *   npx tsx engine/tools/dot_stage_unlocks.mts
 *
 * 화면에서 흐리게 하는 것은 **잠근 게 아니다** — `fetch` 한 줄이면 넘어온다. 문은 서버에 있어야 하고,
 * 그 문을 여기서 두드린다. 그리고 열렸을 때 **실제로 쓸 수 있는지**도 같이 본다(잠그기만 하고
 * 안 열리는 것도 고장이다).
 *
 * 배경은 그림 파일 한 장이라 서버 문이 없다 — 대신 **열 명 그림이 다 있고 규격이 같은지**를 잰다.
 */
import { readFileSync, existsSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
const sharp = (await import("sharp")).default;
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { runDotTurn } = await import("../../src/lib/dot/turn");
const { todayKST, stageFor } = await import("../../src/lib/dot/bond");
const { EMOTICON_STAGE, FACE_KEYS, FACE_PREFIX } = await import("../../src/lib/dot/stickers");

const WALLPAPER_STAGE = 3;   // DotChat 의 값과 같아야 한다(화면에서 가져오면 서버 코드가 화면을 import 한다)
const db = createServiceClient();
const 결과: boolean[] = [];
const 재기 = (무엇: string, 맞음: boolean, 본것: string) => { 결과.push(맞음); console.log(`${맞음 ? "맞음" : "틀림"}  ${무엇} — ${본것}`); };

/* ── 배경: 열 장이 다 있고 규격이 같은가 ───────────────────────── */
const { data: chars } = await db.from("dot_characters").select("id, slug, name").eq("is_public", true).order("slug");
const 없는것: string[] = [], 틀린크기: string[] = [];
for (const c of (chars ?? []) as any[]) {
  const p = `public/wallpapers/char/${c.slug}.png`;
  if (!existsSync(p)) { 없는것.push(c.slug); continue; }
  const m = await sharp(p).metadata();
  if (m.width !== 160 || m.height !== 240) 틀린크기.push(`${c.slug} ${m.width}x${m.height}`);
}
재기(`배경이 ${(chars ?? []).length}명 다 있다`, 없는것.length === 0, 없는것.length ? `없다: ${없는것.join(",")}` : `${(chars ?? []).length}장`);
재기("배경 규격 160×240 (여섯 장과 같은 자)", 틀린크기.length === 0, 틀린크기.length ? 틀린크기.join(" · ") : "다 같다");

/* ── 이모티콘: 얼굴 여섯 칸이 다 있나 (새로 안 그리고 이걸 쓴다) ── */
const 얼굴없음: string[] = [];
for (const c of (chars ?? []) as any[]) for (const e of FACE_KEYS) {
  if (!existsSync(`public/dot-sprites/${c.slug}/face/${e}.png`)) 얼굴없음.push(`${c.slug}/${e}`);
}
재기(`이모티콘으로 쓸 얼굴 ${(chars ?? []).length}×${FACE_KEYS.length}칸`, 얼굴없음.length === 0, 얼굴없음.length ? `없다: ${얼굴없음.slice(0, 5).join(",")}` : "다 있다");

/* ── 5단계 문: 낮은 단계는 막히고, 5단계는 된다 ────────────────── */
const 그사람 = (chars as any[])[0];
async function 사람만들기(점수: number): Promise<string> {
  const 메일 = `unlock-${점수}-${Date.now()}@dugeun.local`;
  const { data } = await db.auth.admin.createUser({ email: 메일, password: `t-${Math.random().toString(36).slice(2)}!A1`, email_confirm: true });
  const uid = data!.user!.id;
  await db.from("dot_usage").upsert({ user_id: uid, day: todayKST(), turns: 0, bonus_turns: 20, ad_refills: 0 }, { onConflict: "user_id,day" });
  await db.from("dot_bonds").upsert({ user_id: uid, character_id: 그사람.id, points: 점수, stage: stageFor(점수), streak_days: 1, last_talked_on: todayKST() }, { onConflict: "user_id,character_id" });
  return uid;
}
const 지우기 = async (uid: string) => {
  for (const t of ["dot_messages", "dot_bonds", "dot_usage", "dot_wallet"]) await db.from(t).delete().eq("user_id", uid);
  await db.auth.admin.deleteUser(uid);
};

const 낮은이 = await 사람만들기(100);          // 2단계
const r낮음: any = await runDotTurn(db, 낮은이, 그사람.id, `(${그사람.name}의 웃음 이모티콘)`, { userSticker: `${FACE_PREFIX}happy` });
const { data: 낮은쓴것 } = await db.from("dot_usage").select("turns").eq("user_id", 낮은이).eq("day", todayKST()).maybeSingle();
재기(`${EMOTICON_STAGE}단계 전에는 이모티콘이 막힌다`, r낮음.ok === false, r낮음.ok ? "통과해 버렸다" : `${r낮음.reason} — ${r낮음.message ?? ""}`);
재기("막혔으면 하트도 안 쓴다", Number((낮은쓴것 as any)?.turns ?? 0) === 0, `쓴 하트 ${Number((낮은쓴것 as any)?.turns ?? 0)}개`);
await 지우기(낮은이);

const 높은이 = await 사람만들기(1200);         // 5단계
const r높음: any = await runDotTurn(db, 높은이, 그사람.id, `(${그사람.name}의 웃음 이모티콘)`, { userSticker: `${FACE_PREFIX}happy` });
재기(`${EMOTICON_STAGE}단계면 이모티콘이 된다`, r높음.ok === true, r높음.ok ? `답 "${String(r높음.reply).slice(0, 24)}…"` : `${r높음.reason} ${r높음.message ?? ""}`);
const { data: 남은줄 } = await db.from("dot_messages").select("sticker").eq("user_id", 높은이).eq("role", "user").limit(2);
재기("표에 user:face:<감정> 으로 남는다", ((남은줄 ?? []) as any[]).some((m) => m.sticker === `user:${FACE_PREFIX}happy`),
  ((남은줄 ?? []) as any[]).map((m) => m.sticker).join(",") || "없다");
await 지우기(높은이);

console.log(`\n배경은 ${WALLPAPER_STAGE}단계 · 이모티콘은 ${EMOTICON_STAGE}단계`);
const 틀린 = 결과.filter((x) => !x).length;
console.log(`${결과.length - 틀린}/${결과.length} 맞음`);
process.exit(틀린 ? 1 : 0);
