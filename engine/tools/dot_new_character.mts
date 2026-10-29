/**
 * 네 번째부터의 캐릭터 — **설정 한 장 → 명령 하나** (39회차, 09-11).
 *
 *   npx tsx engine/tools/dot_new_character.mts <설정.json> [--ref seoha] [--quality medium] [--public]
 *
 * 설정.json:
 *   { "slug": "doyun", "name": "도윤", "tagline": "…", "look": "<영어 겉모습>", "persona": "…", "speech": "…",
 *     "greeting": "…", "chips": ["…","…","…"], "formal_start": true, "default_emotion": "neutral",
 *     "voice_ladder": "polite" | "tsundere" | "blunt" }
 *
 * 하는 일(사람 손 0회): 시트 한 장(참조 시트로 화풍 맞춤) → 여섯 칸 자르기 → 자 7개 → 얼굴 크롭 → 저장소 →
 * dot_characters 행(기본은 is_public=false — 사장님이 보고 켠다). 자가 하나라도 떨어지면 **올리지 않는다.**
 *
 * ## `voice_ladder` 는 **없으면 멈춘다** (10-29)
 *
 * 이 도구는 그 칸을 **한 번도 쓰지 않았다.** 그래서 이 도구로 만든 나비·하루·연우는 칸이 빈 채로 올라갔고,
 * 빈 칸은 `formal_start` 만 보고 메워진다 — 반말로 시작하는 사람은 전부 `blunt`
 * ("한 문장, 15자 이하, 감정 표현은 하지 않는다") 가 된다. **발랄한 버튜버 나비와 온몸으로 반가워하는 하루가
 * 두 달 동안 그 줄로 말하고 있었다.** 09-30 에 서하의 성격이 깨진 걸 고치며 만든 칸인데, 만드는 길에 없었다.
 *
 * 비어도 돌아가는 칸은 비어 있게 된다. 그래서 **그림값을 쓰기 전에** 막는다.
 * 어느 사다리인지는 사장님 것이다([[creative-direction-is-users]]) — 내가 성격에서 짐작해 채우지 않는다.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) { const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0,i).trim()] = l.slice(i+1).trim(); }
import sharp from "sharp";
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { createImageProvider } = await import("../../src/lib/providers/images");
const { sheetPrompt, restylePrompt, cutSheet, measureCells, pixelize, SHEET_ORDER } = await import("../../src/lib/dot/sprites");
const { faceCrop } = await import("./dot_faces_lib");

const args = process.argv.slice(2);
const specPath = args.find((a) => a.endsWith(".json"));
if (!specPath) { console.error("설정 JSON 파일이 필요하다"); process.exit(1); }
const refAt = args.indexOf("--ref"); const ref = refAt > 0 ? args[refAt + 1] : "seoha";
const qAt = args.indexOf("--quality"); const quality = (qAt > 0 ? args[qAt + 1] : "medium") as "low" | "medium" | "high";
const makePublic = args.includes("--public");
const spec = JSON.parse(readFileSync(specPath, "utf8")) as {
  slug: string; name: string; tagline: string; look: string; persona: string; speech: string; greeting: string;
  chips?: string[]; formal_start?: boolean; default_emotion?: string; voice_ladder?: string;
};
/** **그림값을 쓰기 전에** 칸을 본다 — 윗주석의 까닭. 짐작해 메우지 않고 멈춘다. */
{
  const { VOICE_LADDERS } = await import("../../src/lib/dot/bond");
  if (!spec.voice_ladder || !(VOICE_LADDERS as readonly string[]).includes(spec.voice_ladder)) {
    console.error(`설정에 "voice_ladder" 가 없거나 모르는 값이다: ${JSON.stringify(spec.voice_ladder)}`);
    console.error(`  쓸 수 있는 것: ${VOICE_LADDERS.join(" · ")}`);
    console.error(`  이 칸이 비면 ${spec.formal_start === false ? "blunt(한 문장·15자 이하·감정 표현 없음)" : "polite(전부 존댓말로 시작)"} 로 말하게 된다 — 성격이 깨진다.`);
    process.exit(1);
  }
}
/**
 * **시트가 사는 곳** (228회차 10-03 고침).
 *
 * 전에는 **옛 세션의 임시 폴더**가 박혀 있었다. 그 세션이 끝나면서 폴더가 사라져,
 * 이 도구는 그림을 만들기도 전에 ENOENT 로 죽었다 — 그러고도 **그 아래 catch 가 안 돌았다**
 * (참조 파일 읽기가 `.catch()` **밖**이라, 던지는 순간 대비책까지 같이 죽는다).
 * 임시 폴더에 둔 것이 잘못이었다: 쓰고 버리는 자리에 **다음에도 쓸 것**을 두면 안 된다.
 */
const SHEET = "C:/Users/az518/Desktop/두근도트-시트";
mkdirSync(`${SHEET}/faces`, { recursive: true });

/**
 * **이미 만든 시트를 다시 쓴다** (`--use-sheet`). 자를 고치고 다시 재 보는 데 그림값을 또 낼 까닭이 없다 —
 * 10-03 에 뭉개기를 길에 넣고 확인할 때, 이미 있던 시트로 공짜로 확인했다.
 */
const 시트다시 = args.includes("--use-sheet");
console.log(`1) 시트 — 본: ${ref} · 품질 ${quality}${시트다시 ? " · **이미 있는 시트를 쓴다(그림값 0)**" : ""}`);
const drawer = createImageProvider();
const look = { name: spec.name, appearance: spec.look };
const t0 = Date.now();
// 참조 시트를 **먼저 읽어 본다.** 읽기가 `.catch()` 밖에 있으면 없을 때 대비책이 안 돈다.
const 있던시트 = (() => {
  if (!시트다시) return null;
  try { return readFileSync(`${SHEET}/${spec.slug}-sheet.png`).toString("base64"); }
  catch { console.warn(`   --use-sheet 인데 ${spec.slug}-sheet.png 가 없다 → 새로 그린다.`); return null; }
})();
const 참조 = (() => {
  try { return readFileSync(`${SHEET}/${ref}-sheet.png`).toString("base64"); }
  catch { console.warn(`   참조 시트가 없다(${SHEET}/${ref}-sheet.png) → 새로 그린다. 화풍이 기존과 다를 수 있다.`); return null; }
})();
const made = 있던시트
  ? { dataUrl: "data:image/png;base64," + 있던시트, inputTokens: 0, outputTokens: 0 }
  : 참조
  ? await drawer.edit("data:image/png;base64," + 참조, restylePrompt(look), "1536x1024", quality)
      .catch(async (e) => { console.warn("   참조 그리기 실패 → 새로 그린다:", e instanceof Error ? e.message : e); return drawer.draw(sheetPrompt(look), quality, "1536x1024"); })
  : await drawer.draw(sheetPrompt(look), quality, "1536x1024");
console.log(`   ${((Date.now() - t0) / 1000).toFixed(1)}s · 토큰 in ${made.inputTokens} out ${made.outputTokens}`);
writeFileSync(`${SHEET}/${spec.slug}-sheet.png`, Buffer.from(made.dataUrl.split(",")[1], "base64"));

console.log("2) 자르기 + 뭉개기 + 자");
const 자른것 = await cutSheet(made.dataUrl);
/**
 * **뭉개는 단계가 길에 없었다** (228회차 10-03).
 *
 * `도트다` 자는 "pixelize 가 24색으로 줄인 뒤라 40색이 넘으면 뭉개기가 안 먹은 것" 이라고 적혀 있는데,
 * `pixelize` 는 **정의만 있고 아무 데서도 안 불리고 있었다.** 그래서 그림이 아무리 잘 나와도
 * 색이 500~800 으로 나와 **늘 떨어졌다**(나비 첫 판 791색, 둘째 판 525색).
 * 자가 **길에 없는 단계를 가정하고 재면**, 좋은 것이 떨어진다.
 * `pixelize` 안에 `cleanSprite`(떨어진 조각 지우기 + 알파 굳히기)가 들어 있어 그 자도 같이 잡힌다.
 */
const cells = await Promise.all(자른것.map(async (c) => ({ ...c, png: await pixelize(c.png) })));
for (const c of cells) writeFileSync(`${SHEET}/${spec.slug}-${c.emotion}.png`, c.png);
const { cases } = await measureCells(cells);
let failed = 0;
for (const c of cases) { console.log(`   ${c.result === "Passed" ? "✅" : c.result === "Failed" ? "❌" : "◻︎"} ${c.name} — ${c.message}`); if (c.result === "Failed") failed++; }

console.log("3) 얼굴 크롭 + 42px 구별");
const faces: Buffer[] = [];
for (const c of cells) { const f = await faceCrop(c.png); faces.push(f); writeFileSync(`${SHEET}/faces/${spec.slug}-${c.emotion}-face.png`, f); }
{
  const raws = await Promise.all(faces.map(async (f) => { const { data, info } = await sharp(f).resize(42, 42, { kernel: "nearest" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { data, ch: info.channels }; }));
  let minDiff = 1;
  for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) { const A = raws[i], B = raws[j]; let d = 0, n = 0; for (let p = 0; p < A.data.length; p += A.ch) { if (A.data[p+3] < 128 && B.data[p+3] < 128) continue; n++; if (Math.abs(A.data[p]-B.data[p]) + Math.abs(A.data[p+1]-B.data[p+1]) + Math.abs(A.data[p+2]-B.data[p+2]) > 60) d++; } minDiff = Math.min(minDiff, n ? d / n : 0); }
  const ok = minDiff >= 0.06; if (!ok) failed++;
  console.log(`   ${ok ? "✅" : "❌"} 42px_구별 — 가장 닮은 두 표정 차이 ${(minDiff * 100).toFixed(1)}% (≥6%)`);
}
const strip = await sharp({ create: { width: 256 * 6, height: 256 + 96, channels: 4, background: "#b2c7d9" } })
  .composite([
    ...await Promise.all(cells.map(async (c, i) => ({ input: await sharp(c.png).resize(256, 256, { kernel: "nearest", fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer(), left: i * 256, top: 0 }))),
    ...faces.map((f, i) => ({ input: f, left: i * 256 + 80, top: 256 })),
  ]).png().toBuffer();
writeFileSync(`${SHEET}/${spec.slug}-strip.png`, strip);

if (failed) { console.log(`\n❌ 자 ${failed}개 실패 — 올리지 않는다. ${SHEET}/${spec.slug}-strip.png 를 보고 설정을 고쳐 다시.`); process.exit(1); }

console.log("4) 저장소 + 표");
const db = createServiceClient();
const sprites: Record<string, string> = {}, faceUrls: Record<string, string> = {};
for (const [i, c] of cells.entries()) {
  for (const [path, body, box] of [[`${spec.slug}/${c.emotion}.png`, c.png, sprites], [`${spec.slug}/face/${c.emotion}.png`, faces[i], faceUrls]] as [string, Buffer, Record<string, string>][]) {
    const { error } = await db.storage.from("dot-sprites").upload(path, body, { contentType: "image/png", upsert: true });
    if (error) throw new Error(`${path}: ${error.message}`);
    box[c.emotion] = db.storage.from("dot-sprites").getPublicUrl(path).data.publicUrl;
  }
}
const row = { slug: spec.slug, name: spec.name, tagline: spec.tagline, look: spec.look, persona: spec.persona, speech: spec.speech, greeting: spec.greeting,
  chips: spec.chips ?? [], formal_start: spec.formal_start ?? true, default_emotion: spec.default_emotion ?? "neutral", sprites, faces: faceUrls, is_public: makePublic,
  voice_ladder: spec.voice_ladder };
const { error } = await db.from("dot_characters").upsert(row, { onConflict: "slug" });
if (error) throw new Error(error.message);
console.log(`\n끝: ${spec.name} · 공개 ${makePublic ? "함" : "안 함(사장님이 보고 켠다)"} · 미리보기 ${SHEET}/${spec.slug}-strip.png`);
console.log(`   순서: ${SHEET_ORDER.join(" · ")}`);
/* 영어 칸(`en`)은 여기서 안 채운다 — 번역은 모델을 부르는 딴 길이고, 안 채우면 영어판에
   한국어가 나간다. 잊지 않도록 **다음 명령을 적어 둔다**(10-29). */
console.log(`   영어 칸: AI_PROVIDER=openai npx tsx engine/tools/dot_translate_content.mts --진짜`);
