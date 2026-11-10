/**
 * # 캐릭터 배경화면 — **3단계에 열리는 그 사람의 자리**  (11-10 사장님 기획)
 *
 *   npx tsx engine/tools/dot_char_wallpaper.mts            ← 없는 것만
 *   npx tsx engine/tools/dot_char_wallpaper.mts --only rin --redo
 *
 * 사장님: *"호감도 3에는 그 호감도 친구에 맞는 배경화면."*
 *
 * ## 기준은 이미 있는 배경과 **같다**
 *
 * `dot_wallpapers.mts` 가 만든 여섯 장(160×240 · 32색 · 살짝 어둡게)과 한 줄에 서야 한다 —
 * 말풍선이 위에 얹히는 그림이라 밝으면 글이 안 읽힌다. **사람은 안 그린다**: 그 사람 방인데
 * 그 사람이 그림 속에 또 있으면 말풍선 옆에 두 명이 된다.
 *
 * ## 장면은 **지어내지 않는다**
 *
 * 그 사람 persona 의 "좋아하는 것" 줄과 이미 뽑아 둔 사진 장면에서 가져온다
 * ([[creative-direction-is-users]] — 내 머리로 캐릭터를 만들지 않는다).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
const sharp = (await import("sharp")).default;
const { createImageProvider } = await import("../../src/lib/providers/images");
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { likesLine } = await import("../../src/lib/dot/bond");
const { defaultProviders } = await import("../../src/lib/execution/shared");
const { z } = await import("zod");

const 끌 = (이름: string) => { const i = process.argv.indexOf(이름); return i > 0 ? process.argv[i + 1] : undefined; };
const only = 끌("--only")?.split(",");
const 다시 = process.argv.includes("--redo");
const OUT = "public/wallpapers/char";
mkdirSync(OUT, { recursive: true });
const W = 160, H = 240;

const db = createServiceClient();
const { data: chars } = await db.from("dot_characters").select("slug, name, persona, photos").eq("is_public", true).order("slug");
const 그릴것 = ((chars ?? []) as any[]).filter((c) => (!only || only.includes(c.slug)) && (다시 || !existsSync(`${OUT}/${c.slug}.png`)));
if (!그릴것.length) { console.log("그릴 것이 없다 (--redo 면 다시 그린다)"); process.exit(0); }

const 그림 = createImageProvider();
console.log(`배경 ${그릴것.length}장 — 160×240 · 32색 · 사람 없음\n`);
let 실패 = 0;
for (const c of 그릴것) {
  const 장면들 = ((c.photos ?? []) as { caption?: string }[]).map((p) => p.caption).filter(Boolean).slice(0, 8).join(", ");
  /* 장면 한 줄은 **그 사람 글에서** 뽑는다 — 싼 자리로 한 번. */
  let 영문 = "a quiet room at night with a small lamp";
  try {
    const out = await defaultProviders().ai.generateStructuredOutput({
      systemInstructions: "너는 도트 배경 장면을 한 줄 영어로 적는다. 사람·동물·글자는 넣지 않는다. 장소와 빛만 적는다.",
      input: [`이름: ${c.name}`, `좋아하는 것: ${likesLine(c.persona ?? "").trim()}`, `자주 있는 곳: ${장면들}`,
        "이 사람의 **방 또는 가장 자주 있는 자리**를 한 줄 영어로. 20낱말 이내."].join("\n"),
      schema: z.object({ scene: z.string() }),
      schemaName: "wallpaper_scene", maxTokens: 120, tier: "conversation",
    });
    영문 = String((out.output as any).scene ?? 영문).slice(0, 200);
  } catch { /* 못 물어보면 기본값 */ }

  const prompt = `Pixel art background for a chat app, vertical phone wallpaper. ${영문}. 16-bit pixel art, limited palette, flat colors, crisp pixels, no anti-aliasing. NO people, NO characters, NO animals, NO text, NO letters, NO logos, NO UI. Calm, quiet, slightly dark so white and yellow speech bubbles stay readable on top.`;
  const t0 = Date.now();
  try {
    const made = await 그림.draw(prompt, "low", "1024x1536");
    const raw = Buffer.from(made.dataUrl.split(",")[1], "base64");
    const small = await sharp(raw).resize(W, H, { kernel: "nearest", fit: "cover" }).modulate({ brightness: 0.85, saturation: 0.9 })
      .png({ palette: true, colors: 32, dither: 0 }).toBuffer();
    writeFileSync(`${OUT}/${c.slug}.png`, small);
    console.log(`  ${c.name.padEnd(4)} ${((Date.now() - t0) / 1000).toFixed(1)}s · ${Math.round(small.length / 1024)}KB · ${영문}`);
  } catch (e) { 실패++; console.log(`  ✗ ${c.name}: ${e instanceof Error ? e.message : e}`); }
}
console.log(`\n나간 곳 ${OUT} — **배포해야 앱에서 보인다**(railway up --service dot-web --ci)`);
process.exit(실패 ? 1 : 0);
