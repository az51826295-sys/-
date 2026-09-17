/**
 * 프로필 사진 — **그 캐릭터의 개인 스냅사진** (09-11, 사장님 "프로필 사진은 감정 없애고 여행 등 개인적인 사진").
 *
 * 카톡 프로필처럼: 여행지에서, 카페에서, 취미 하는 모습. 표정 시트를 **본으로 삼아**(edit) 같은 사람이 나오게 하고,
 * 세로 4:5 로 뽑아 도트로 뭉갠다(200×250, 32색). 인물당 3장. 저장소 `<slug>/photo/<n>.png`, 표 `photos` [{url, caption}].
 *
 *   npx tsx engine/tools/dot_photos.mts [slug ...]     (없으면 공개 인물 전부)
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) { const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0,i).trim()] = l.slice(i+1).trim(); }
import sharp from "sharp";
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { createImageProvider } = await import("../../src/lib/providers/images");

const SHEET = "C:/Users/az518/AppData/Local/Temp/claude/C--Users-az518-Desktop/d7b8eaa0-592d-4d32-a057-634ae1e64f74/scratchpad/sheet";
const OUT = SHEET + "/photos"; mkdirSync(OUT, { recursive: true });
const W = 200, H = 250;

/** 인물마다 어울리는 장면 셋 — 설정(취향·일상)에서 따왔다. */
const SCENES: Record<string, { caption: string; scene: string }[]> = {
  yuna: [
    { caption: "새벽 빵집", scene: "in a small bakery at dawn, holding a tray of fresh salt bread, warm oven light" },
    { caption: "비 오는 창가", scene: "sitting by a rainy window with a cup of tea, knitting a scarf, cozy" },
    { caption: "주말 시장", scene: "at a weekend street market, holding a paper bag of fruit, sunny" },
  ],
  seoha: [
    { caption: "편의점 앞", scene: "outside a convenience store at night, drinking strawberry milk from a carton, neon sign" },
    { caption: "오락실", scene: "at an arcade rhythm game machine, mid-play, colorful lights" },
    { caption: "비 오는 하굣길", scene: "walking home from school in the rain without an umbrella, looking annoyed but content" },
  ],
  rin: [
    { caption: "새벽 산책", scene: "on a quiet early-morning walk along a riverside path, holding a can of coffee, misty" },
    { caption: "이불 속", scene: "wrapped in a blanket on a bed at night, watching a phone, room lit by a screen" },
    { caption: "옛날 게임", scene: "sitting on the floor playing a retro handheld game console, pixel game on screen" },
  ],
  doyun: [
    { caption: "야근", scene: "at an office desk late at night, loosened tie, laptop glow, coffee cups" },
    { caption: "편의점 라면", scene: "eating cup ramen at a convenience store counter at dawn" },
    { caption: "산책", scene: "walking a small dog in a park on a weekend morning" },
  ],
};

const db = createServiceClient();
const drawer = createImageProvider();
// caption 은 기록용(alt)이다 — 화면엔 안 쓴다(09-11 사장님 "비 오는 창가라고 글 넣지 말라고"). `slug:2` 로 한 장만 다시.
const wanted = process.argv.slice(2).map((a) => a.split(":")[0]);
const onlyIdx: Record<string, number> = {}; for (const a of process.argv.slice(2)) { const [s, n] = a.split(":"); if (n) onlyIdx[s] = Number(n); }
const { data: chars } = await db.from("dot_characters").select("slug, name, look").order("created_at");
for (const c of (chars ?? []) as { slug: string; name: string; look: string }[]) {
  if (wanted.length ? !wanted.includes(c.slug) : !SCENES[c.slug]) continue;
  const scenes = SCENES[c.slug]; if (!scenes) continue;
  const ref = "data:image/png;base64," + readFileSync(`${SHEET}/${c.slug}-sheet.png`).toString("base64");
  const { data: cur } = await db.from("dot_characters").select("photos").eq("slug", c.slug).maybeSingle();
  const photos: { url: string; caption: string }[] = Array.isArray(cur?.photos) ? cur!.photos : [];
  for (const [i, sc] of scenes.entries()) {
    if (onlyIdx[c.slug] && onlyIdx[c.slug] !== i + 1) continue;
    const prompt = [
      `Using the character from this expression sheet — SAME face, SAME hair style and color, same overall look (${c.look}) — draw ONE pixel-art snapshot photo of that character.`,
      `Scene: ${sc.scene}. Waist-up or three-quarter view, character clearly the main subject and large in frame, looking natural (not posed like a sprite sheet).`,
      `Style: 16-bit pixel art, chunky crisp pixels, limited palette, no anti-aliasing. Vertical 4:5 snapshot with a real background (not transparent). NO text, NO letters, NO UI, NO borders, NO grid, NO other people.`,
    ].join(" ");
    const t0 = Date.now();
    const made = await drawer.edit(ref, prompt, "1024x1536", "medium");
    const raw = Buffer.from(made.dataUrl.split(",")[1], "base64");
    const small = await sharp(raw).resize(W, H, { kernel: "nearest", fit: "cover", position: "top" }).png({ palette: true, colors: 32, dither: 0 }).toBuffer();
    writeFileSync(`${OUT}/${c.slug}-${i + 1}.png`, small);
    const path = `${c.slug}/photo/${i + 1}.png`;
    const { error } = await db.storage.from("dot-sprites").upload(path, small, { contentType: "image/png", upsert: true });
    if (error) throw new Error(`${path}: ${error.message}`);
    photos[i] = { url: db.storage.from("dot-sprites").getPublicUrl(path).data.publicUrl + "?v=" + Date.now(), caption: sc.caption };
    console.log(`${c.name} ${i + 1}/3 ${sc.caption} · ${((Date.now() - t0) / 1000).toFixed(1)}s · ${Math.round(small.length / 1024)}KB`);
  }
  const { error } = await db.from("dot_characters").update({ photos }).eq("slug", c.slug);
  if (error) throw new Error(error.message);
}
// 미리보기
const files = (chars ?? []).filter((c) => SCENES[(c as { slug: string }).slug]).flatMap((c) => [1, 2, 3].map((i) => `${OUT}/${(c as { slug: string }).slug}-${i}.png`));
const tiles = await Promise.all(files.map(async (f, i) => { try { return { input: readFileSync(f), left: (i % 6) * W, top: Math.floor(i / 6) * H }; } catch { return null; } }));
const rows = Math.ceil(files.length / 6);
const strip = await sharp({ create: { width: W * 6, height: H * rows, channels: 3, background: "#111" } }).composite(tiles.filter(Boolean) as { input: Buffer; left: number; top: number }[]).png().toBuffer();
writeFileSync(`${SHEET}/photos-strip.png`, strip);
console.log(`→ ${SHEET}/photos-strip.png`);
