/**
 * 네 번째부터의 캐릭터 — **설정 한 장 → 명령 하나** (39회차, 09-11).
 *
 *   npx tsx engine/tools/dot_new_character.mts <설정.json> [--ref seoha] [--quality medium] [--public]
 *
 * 설정.json:
 *   { "slug": "doyun", "name": "도윤", "tagline": "…", "look": "<영어 겉모습>", "persona": "…", "speech": "…",
 *     "greeting": "…", "chips": ["…","…","…"], "formal_start": true, "default_emotion": "neutral" }
 *
 * 하는 일(사람 손 0회): 시트 한 장(참조 시트로 화풍 맞춤) → 여섯 칸 자르기 → 자 7개 → 얼굴 크롭 → 저장소 →
 * dot_characters 행(기본은 is_public=false — 사장님이 보고 켠다). 자가 하나라도 떨어지면 **올리지 않는다.**
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) { const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0,i).trim()] = l.slice(i+1).trim(); }
import sharp from "sharp";
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { createImageProvider } = await import("../../src/lib/providers/images");
const { sheetPrompt, restylePrompt, cutSheet, measureCells, SHEET_ORDER } = await import("../../src/lib/dot/sprites");
const { faceCrop } = await import("./dot_faces_lib");

const args = process.argv.slice(2);
const specPath = args.find((a) => a.endsWith(".json"));
if (!specPath) { console.error("설정 JSON 파일이 필요하다"); process.exit(1); }
const refAt = args.indexOf("--ref"); const ref = refAt > 0 ? args[refAt + 1] : "seoha";
const qAt = args.indexOf("--quality"); const quality = (qAt > 0 ? args[qAt + 1] : "medium") as "low" | "medium" | "high";
const makePublic = args.includes("--public");
const spec = JSON.parse(readFileSync(specPath, "utf8")) as {
  slug: string; name: string; tagline: string; look: string; persona: string; speech: string; greeting: string;
  chips?: string[]; formal_start?: boolean; default_emotion?: string;
};
const SHEET = "C:/Users/az518/AppData/Local/Temp/claude/C--Users-az518-Desktop/d7b8eaa0-592d-4d32-a057-634ae1e64f74/scratchpad/sheet";
mkdirSync(`${SHEET}/faces`, { recursive: true });

console.log(`1) 시트 — 본: ${ref} · 품질 ${quality}`);
const drawer = createImageProvider();
const look = { name: spec.name, appearance: spec.look };
const t0 = Date.now();
const made = await drawer.edit("data:image/png;base64," + readFileSync(`${SHEET}/${ref}-sheet.png`).toString("base64"), restylePrompt(look), "1536x1024", quality)
  .catch(async (e) => { console.warn("   참조 그리기 실패 → 새로 그린다:", e instanceof Error ? e.message : e); return drawer.draw(sheetPrompt(look), quality, "1536x1024"); });
console.log(`   ${((Date.now() - t0) / 1000).toFixed(1)}s · 토큰 in ${made.inputTokens} out ${made.outputTokens}`);
writeFileSync(`${SHEET}/${spec.slug}-sheet.png`, Buffer.from(made.dataUrl.split(",")[1], "base64"));

console.log("2) 자르기 + 자");
const cells = await cutSheet(made.dataUrl);
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
  chips: spec.chips ?? [], formal_start: spec.formal_start ?? true, default_emotion: spec.default_emotion ?? "neutral", sprites, faces: faceUrls, is_public: makePublic };
const { error } = await db.from("dot_characters").upsert(row, { onConflict: "slug" });
if (error) throw new Error(error.message);
console.log(`\n끝: ${spec.name} · 공개 ${makePublic ? "함" : "안 함(사장님이 보고 켠다)"} · 미리보기 ${SHEET}/${spec.slug}-strip.png`);
console.log(`   순서: ${SHEET_ORDER.join(" · ")}`);
