/**
 * 새 사진 한 장 — 피드가 매주 새로워지게 (87회차 09-12).
 *
 * 사진 3장을 날짜로 돌리면 나흘째부터 같은 사진이 다시 온다. 인물마다 **주 1회 한 장**을 더한다:
 *   장면은 DeepSeek 가 그 인물의 설정과 **이미 있는 사진 설명을 피해서** 제안(싼 자리), 그림은 표정 시트를 본으로 edit(₩55/장).
 * 자: (1) 새 장면 설명이 기존 것과 2글자 뿌리를 안 나눔 (2) 200×250 · ≤32색 (3) photos 길이 +1.
 *
 *   npx tsx engine/tools/dot_photo_new.mts [slug…]     (없으면 공개 인물 전부) · 내 PC 에서 주 1회 돌린다(시트 PNG 가 여기 있다)
 */
import { readFileSync, writeFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) { const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0,i).trim()] = l.slice(i+1).trim(); }
process.env.AI_PROVIDER = "deepseek";
import sharp from "sharp";
import { z } from "zod";
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { createImageProvider } = await import("../../src/lib/providers/images");
const { defaultProviders } = await import("../../src/lib/execution/shared");

const SHEET = "C:/Users/az518/AppData/Local/Temp/claude/C--Users-az518-Desktop/d7b8eaa0-592d-4d32-a057-634ae1e64f74/scratchpad/sheet";
const W = 200, H = 250;
const db = createServiceClient();
const drawer = createImageProvider();
const wanted = process.argv.slice(2);
const roots = (s: string) => new Set((s.match(/[가-힣]{2,}/g) ?? []).map((w) => w.slice(0, 2)));
const shape = z.object({ caption: z.string(), scene: z.string() });

const q = db.from("dot_characters").select("slug, name, look, persona, photos");
const { data: chars } = wanted.length ? await q.in("slug", wanted) : await q.eq("is_public", true);
let bad = 0;
for (const c of (chars ?? []) as { slug: string; name: string; look: string; persona: string; photos: { url: string; caption: string }[] | null }[]) {
  const photos = Array.isArray(c.photos) ? c.photos : [];
  const have = photos.map((p) => p.caption);
  const t0 = Date.now();
  const idea = (await defaultProviders().ai.generateStructuredOutput({
    systemInstructions: [
      `너는 "${c.name}" 의 SNS 사진을 기획한다. 이 인물: ${c.persona}`,
      `이미 올린 사진: ${have.join(", ") || "없음"} — 이것들과 **다른 장소·다른 활동**이어야 한다. 실내만 반복하지 말고 바깥·여행·계절·취미를 섞는다.`,
      "답: `caption` 한국어 2~6글자 장면 이름(예: 바닷가, 놀이공원, 첫눈), `scene` 영어 한 문장(장소·행동·조명·소품, 사진 찍히는 모습, 다른 사람 없음).",
      "성적인 내용·글자·로고 없음.",
    ].join("\n"),
    input: "(새 사진 한 장을 기획한다)", schema: shape, schemaName: "dot_photo_idea", maxTokens: 200, tier: "conversation",
  })).output;
  const dup = [...roots(idea.caption)].some((r) => have.some((h) => roots(h).has(r)));
  const ref = "data:image/png;base64," + readFileSync(`${SHEET}/${c.slug}-sheet.png`).toString("base64");
  const prompt = [
    `Using the character from this expression sheet — SAME face, SAME hair style and color, same overall look (${c.look}) — draw ONE pixel-art snapshot photo of that character.`,
    `Scene: ${idea.scene}. Waist-up or three-quarter view, character clearly the main subject and large in frame, looking natural.`,
    `Style: 16-bit pixel art, chunky crisp pixels, limited palette, no anti-aliasing. Vertical 4:5 snapshot with a real background. NO text, NO letters, NO UI, NO borders, NO grid, NO other people.`,
  ].join(" ");
  const made = await drawer.edit(ref, prompt, "1024x1536", "medium");
  const small = await sharp(Buffer.from(made.dataUrl.split(",")[1], "base64")).resize(W, H, { kernel: "nearest", fit: "cover", position: "top" }).png({ palette: true, colors: 32, dither: 0 }).toBuffer();
  const n = photos.length + 1;
  writeFileSync(`${SHEET}/photos/${c.slug}-${n}.png`, small);
  const path = `${c.slug}/photo/${n}.png`;
  const { error } = await db.storage.from("dot-sprites").upload(path, small, { contentType: "image/png", upsert: true });
  if (error) throw new Error(`${path}: ${error.message}`);
  const url = db.storage.from("dot-sprites").getPublicUrl(path).data.publicUrl + "?v=" + Date.now();
  const next = [...photos, { url, caption: idea.caption }];
  const { error: e2 } = await db.from("dot_characters").update({ photos: next }).eq("slug", c.slug);
  if (e2) throw new Error(e2.message);
  const meta = await sharp(small).metadata();
  const { data: raw, info } = await sharp(small).raw().toBuffer({ resolveWithObject: true });
  const colors = new Set<number>(); for (let p = 0; p < raw.length; p += info.channels) colors.add((raw[p] << 16) | (raw[p + 1] << 8) | raw[p + 2]);
  const ok = !dup && meta.width === W && meta.height === H && colors.size <= 32 && next.length === photos.length + 1;
  if (!ok) bad++;
  console.log(`${ok ? "✅" : "❌"} ${c.name}: "${idea.caption}" (${idea.scene.slice(0, 60)}…) · ${meta.width}×${meta.height} · ${colors.size}색 · 사진 ${photos.length}→${next.length} · ${dup ? "기존과 겹침 " : ""}${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
process.exit(bad ? 1 : 0);
