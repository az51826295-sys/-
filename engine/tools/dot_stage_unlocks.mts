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
const { FACE_KEYS, FACE_PREFIX, faceStage, facesOpen } = await import("../../src/lib/dot/stickers");

const WALLPAPER_STAGE = 3;   // DotChat 의 값과 같아야 한다(화면에서 가져오면 서버 코드가 화면을 import 한다)
const db = createServiceClient();
const 결과: boolean[] = [];
/** `재기(무엇, 맞음, 본것)` 과 `재기(맞음, 말)` 둘 다 받는다 — 윗부분은 앞 모양으로 적혀 있다. */
function 재기(a: string | boolean, b: boolean | string, c = "") {
  const 맞음 = typeof a === "boolean" ? a : (b as boolean);
  const 말 = typeof a === "boolean" ? (b as string) : a;
  const 본것 = typeof a === "boolean" ? "" : c;
  결과.push(맞음);
  console.log(`${맞음 ? "맞음" : "틀림"}  ${말}${본것 ? ` — ${본것}` : ""}`);
}

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

/**
 * **표정마다 제 단계** (11-10 "이모티콘을 해금 방식으로 바꾸라니까").
 *
 * 둘 다 봐야 한다 — 막혀야 할 것이 막히는지, **열려야 할 것이 열리는지.** 하나만 보면
 * "전부 막기" 나 "전부 열기" 가 통과한다([[measure-the-thing-not-a-proxy]]).
 */
/*
 * 점수를 손으로 적었다가 **2단계라고 둔 계정이 실은 3단계**였다(150점은 3단계다). 그 바람에
 * "sad 가 막힌다" 가 거짓 실패로 떴다 — 코드가 아니라 **심은 조건이 틀린 것**이었다
 * ([[planted-fault-must-be-well-formed]]). 이제 단계에서 점수를 거꾸로 뽑고, 심은 뒤 **진짜 그
 * 단계인지 확인**한다.
 */
const 단계별 = [1, 2, 3, 5].map((단계) => {
  let 점수 = 0;
  while (stageFor(점수) < 단계) 점수 += 1;
  return { 점수, 단계 };
});
for (const 칸 of 단계별) {
  재기(stageFor(칸.점수) === 칸.단계, `${칸.단계}단계로 심을 점수 ${칸.점수} 이 정말 ${칸.단계}단계다`, `stageFor=${stageFor(칸.점수)}`);
  const uid = await 사람만들기(칸.점수);
  const 열려야 = FACE_KEYS.filter((e) => faceStage(e) <= 칸.단계);
  const 막혀야 = FACE_KEYS.filter((e) => faceStage(e) > 칸.단계);
  재기(facesOpen(칸.단계) === 열려야.length, `${칸.단계}단계: ${열려야.length}칸 열림 — ${열려야.join(",")}`);

  const 마지막 = 열려야[열려야.length - 1];
  const r열림: any = await runDotTurn(db, uid, 그사람.id, "(이모티콘)", { userSticker: `${FACE_PREFIX}${마지막}` });
  재기(r열림.ok === true, `${칸.단계}단계: ${마지막} 는 보내진다 ${r열림.ok ? "" : `(${r열림.reason} ${r열림.message ?? ""})`}`);

  if (막혀야.length) {
    const 전: any = (await db.from("dot_usage").select("turns").eq("user_id", uid).eq("day", todayKST()).maybeSingle()).data;
    const r막힘: any = await runDotTurn(db, uid, 그사람.id, "(이모티콘)", { userSticker: `${FACE_PREFIX}${막혀야[0]}` });
    const 후: any = (await db.from("dot_usage").select("turns").eq("user_id", uid).eq("day", todayKST()).maybeSingle()).data;
    재기(r막힘.ok === false, `${칸.단계}단계: ${막혀야[0]} 는 막힌다 — ${r막힘.ok ? "통과해 버렸다" : (r막힘.message ?? r막힘.reason)}`);
    재기(Number(후?.turns ?? 0) === Number(전?.turns ?? 0), `${칸.단계}단계: 막혔으면 하트를 안 쓴다 (${Number(전?.turns ?? 0)}→${Number(후?.turns ?? 0)})`);
  }
  const { data: 남은줄 } = await db.from("dot_messages").select("sticker").eq("user_id", uid).eq("role", "user").limit(3);
  재기(((남은줄 ?? []) as any[]).some((m) => String(m.sticker ?? "").startsWith(`user:${FACE_PREFIX}`)),
    `${칸.단계}단계: 표에 user:face:<감정> 으로 남는다 (${((남은줄 ?? []) as any[]).map((m) => m.sticker).join(",") || "없다"})`);
  await 지우기(uid);
}

console.log(`\n배경 ${WALLPAPER_STAGE}단계 · 이모티콘 ${FACE_KEYS.map((e) => `${e}:${faceStage(e)}`).join(" ")}`);
const 틀린 = 결과.filter((x) => !x).length;
console.log(`${결과.length - 틀린}/${결과.length} 맞음`);
process.exit(틀린 ? 1 : 0);
