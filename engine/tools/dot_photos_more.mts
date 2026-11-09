/**
 * # 게시물 사진 늘리기  (11-09 사장님: *"게시물 사진 자체가 다양하게 하자"*)
 *
 *   npx tsx engine/tools/dot_photos_more.mts                  ← 장면만 뽑아 보여 준다(돈 안 씀)
 *   npx tsx engine/tools/dot_photos_more.mts --go             ← 그림까지 뽑는다
 *   npx tsx engine/tools/dot_photos_more.mts --go --only rin --target 8
 *
 * ## 왜
 *
 * 피드가 똑같아 보이는 뿌리는 글재주가 아니라 **사진이 사람마다 1~4장**이라는 것이다
 * (하루·나비·연우는 **1장**으로 열다섯 번을 올렸다). 자로도 사진 반복 87~94% 가 나온다.
 *
 * ## 어떻게
 *
 * 1. 장면은 **그 사람 설정에서** 싼 자리 모델이 뽑는다 — 이미 있는 장면과 겹치지 않게.
 * 2. 그림은 **지금 앱에 있는 스프라이트를 본으로 삼아**(edit) 뽑는다. 얼굴·머리·옷이 유지된다.
 *    옛 도구(`dot_photos.mts`)는 사라진 시트 폴더를 봤다 — 본은 **살아 있는 것**을 써야 한다.
 * 3. 200×250·32색으로 뭉개서 **`public/dot-sprites/<이름>/photo/<번호>.png`** 에 넣는다.
 *    사진도 스프라이트와 같이 **웹서버가 내보낸다**(Supabase 통이 아니다 — 11-09 에 이걸로 하루를 썼다).
 * 4. 표(`dot_characters.photos`)에 주소와 한글 장면 이름을 적는다. 글 쓸 때 소재로 쓰인다.
 *
 * 돈: 한 장에 18초·약 $0.03(1024×1536 medium). `--go` 없이는 한 푼도 안 쓴다.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
const sharp = (await import("sharp")).default;
const { createClient } = await import("@supabase/supabase-js");
const { createImageProvider } = await import("../../src/lib/providers/images");
const { defaultProviders } = await import("../../src/lib/execution/shared");

const 끌 = (이름: string) => { const i = process.argv.indexOf(이름); return i > 0 ? process.argv[i + 1] : undefined; };
const 누구만 = (끌("--only") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const 목표 = Number(끌("--target") ?? 8);
/** **다시 뽑기** — 이미 있는 사진도 1번부터 새로 뽑는다(기준이 바뀐 날 쓴다). */
const 다시 = process.argv.includes("--redo");
const 갈까 = process.argv.includes("--go");
/**
 * **기준점** — `engine/docs/dot-character-standard.md`.
 * 논리 도트 200×250 을 **2배(400×500)로 저장**한다. 피드 폭이 390 이라 그래야 1:1 에 가깝고,
 * 200×250 로 두면 1.9배로 늘려 쓰느라 뭉개진다(11-09 실측).
 */
const 논리W = 200, 논리H = 250, 배 = 2;
const W = 논리W * 배, H = 논리H * 배;
const 터 = "C:/Users/az518/Desktop/로키-도트/사진-20261109"; mkdirSync(터, { recursive: true });
const 앱밑 = "public/dot-sprites";
const 주소 = (slug: string, n: number) => `https://dot-web-production-7e03.up.railway.app/dot-sprites/${slug}/photo/${n}.png`;

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
/* `--only` 로 이름을 집으면 **아직 안 켠 사람도** 집는다 — 새로 만든 캐릭터는 사진이 있어야 켤 수 있다. */
const 질의 = db.from("dot_characters").select("id, slug, name, persona, look, photos").order("slug");
const { data: chars, error } = 누구만.length ? await 질의.in("slug", 누구만) : await 질의.eq("is_public", true);
if (error) { console.error(`표를 못 읽었다: ${error.message}`); process.exit(1); }

const 장면꼴 = z.object({ 장면들: z.array(z.object({ 이름: z.string(), 영문: z.string() })) });

/** 그 사람다운 장면을 뽑는다 — 이미 있는 것과 겹치지 않게. 한글 이름은 글감이 되고, 영문은 그림 주문이 된다. */
async function 장면뽑기(c: any, 있는것: string[], 몇개: number) {
  const out = await defaultProviders().ai.generateStructuredOutput({
    systemInstructions: [
      `"${c.name}" 의 **개인 스냅사진** 장면을 ${몇개}개 짓는다. SNS 에 올릴 사진이다.`,
      "", "## 이 사람", c.persona ?? "", `생김새: ${c.look ?? ""}`,
      "", "## 이미 있는 장면 (겹치면 안 된다)", ...있는것.map((s) => `- ${s}`),
      "", "## 규칙",
      "- 그 사람의 **일상·일·취미**에서 나온 자리. 특별한 날이 아니라 흔한 하루의 한 장면.",
      "- 계절·시간을 **서로 다르게** 흩는다(낮·밤·새벽, 봄·여름·가을·겨울).",
      "- 사람은 그 사람 혼자. 글자·간판 글씨·로고는 안 나온다.",
      "", "## 답의 모양 (json)",
      "- `장면들`: `이름`(한국어 3~6자, 글감으로 쓸 짧은 이름) · `영문`(그림 생성기에 줄 영어 한 문장: 장소·하는 일·빛)",
    ].join("\n"),
    input: "(장면을 짓는다)",
    schema: 장면꼴, schemaName: "dot_photo_scenes", maxTokens: 1200, tier: "conversation",
  });
  return out.output.장면들.slice(0, 몇개);
}

const 그릴것: { c: any; n: number; 이름: string; 영문: string }[] = [];
for (const c of chars as any[]) {
  if (누구만.length && !누구만.includes(c.slug)) continue;
  const 있는 = 다시 ? [] : ((c.photos ?? []) as { url: string; caption: string }[]);
  const 모자람 = Math.max(0, 목표 - 있는.length);
  if (!모자람) { console.log(`${c.name} 이미 ${있는.length}장`); continue; }
  const 새장면 = await 장면뽑기(c, 다시 ? [] : 있는.map((p) => p.caption), 모자람);
  console.log(`${c.name} ${있는.length}장 → ${목표}장 · 새 장면: ${새장면.map((s) => s.이름).join(" · ")}`);
  새장면.forEach((s, i) => 그릴것.push({ c, n: 있는.length + i + 1, 이름: s.이름, 영문: s.영문 }));
}
console.log(`\n그릴 장 ${그릴것.length}개 · 어림잡아 ${(그릴것.length * 0.03).toFixed(2)}달러 · ${Math.round(그릴것.length * 18 / 60)}분`);
if (!갈까) { console.log(`장면만 뽑았다. 그리려면 --go`); process.exit(0); }

const 그림 = createImageProvider();
const 만든것: Record<string, { url: string; caption: string }[]> = {};
for (const [i, g] of 그릴것.entries()) {
  const 본 = join(앱밑, g.c.slug, "neutral.png");
  if (!existsSync(본)) { console.log(`  ✗ ${g.c.name}: 본이 없다 (${본})`); continue; }
  const ref = "data:image/png;base64," + readFileSync(본).toString("base64");
  const prompt = [
    `Using the character in this image — SAME face, SAME hair style and color, same overall look (${g.c.look ?? ""}) — draw ONE pixel-art snapshot photo of that character.`,
    `Scene: ${g.영문}. Waist-up or three-quarter view, character clearly the main subject and large in frame, looking natural (not posed like a sprite sheet).`,
    `Style: 16-bit pixel art, chunky crisp pixels, limited palette, no anti-aliasing. Vertical 4:5 snapshot with a real background (not transparent). NO text, NO letters, NO UI, NO borders, NO grid, NO other people.`,
  ].join(" ");
  const t0 = Date.now();
  try {
    const made = await 그림.edit(ref, prompt, "1024x1536", "medium");
    const raw = Buffer.from(made.dataUrl.split(",")[1], "base64");
    /* 논리 도트로 먼저 줄인 뒤 정수배로 키운다 — 바로 400×500 으로 줄이면 도트가 1화소가 된다. */
    const 작게 = await sharp(raw).resize(논리W, 논리H, { kernel: "nearest", fit: "cover", position: "top" }).png({ palette: true, colors: 32, dither: 0 }).toBuffer();
    const small = await sharp(작게).resize(W, H, { kernel: "nearest" }).png({ palette: true, colors: 32, dither: 0 }).toBuffer();
    mkdirSync(join(앱밑, g.c.slug, "photo"), { recursive: true });
    writeFileSync(join(앱밑, g.c.slug, "photo", `${g.n}.png`), small);
    writeFileSync(join(터, `${g.c.slug}-${g.n}.png`), small);
    (만든것[g.c.slug] ??= []).push({ url: 주소(g.c.slug, g.n), caption: g.이름 });
    console.log(`  ${i + 1}/${그릴것.length} ${g.c.name} ${g.n}. ${g.이름} · ${((Date.now() - t0) / 1000).toFixed(1)}s · ${Math.round(small.length / 1024)}KB`);
  } catch (e) {
    console.log(`  ✗ ${g.c.name} ${g.이름}: ${e instanceof Error ? e.message : e}`);
  }
}

/* 표에 적는다 — 있던 것 뒤에 붙인다(순서가 파일 번호와 같아야 한다) */
for (const c of chars as any[]) {
  const 새것 = 만든것[c.slug]; if (!새것?.length) continue;
  /* 다시 뽑은 판에서는 옛 목록을 **버린다** — 안 버리면 8장 기준에 16장이 쌓인다. */
  const photos = 다시 ? 새것 : [...((c.photos ?? []) as any[]), ...새것];
  const { error: e } = await db.from("dot_characters").update({ photos }).eq("id", c.id);
  console.log(e ? `  ✗ ${c.name} 표 적기 실패: ${e.message}` : `  ✓ ${c.name} 사진 ${photos.length}장`);
}
console.log(`\n파일은 ${앱밑} 에 들어갔다. **배포해야 앱에서 보인다** — railway up --service dot-web --ci`);
