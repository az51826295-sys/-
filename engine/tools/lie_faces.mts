/**
 * **거짓말의 온도 — 용의자 도트 얼굴** (11-13 사장님 "미감이 중요해" → "도트").
 *
 *   npx tsx engine/tools/lie_faces.mts              ← 무엇을 뽑을지만 보여 준다(그림값 0)
 *   npx tsx engine/tools/lie_faces.mts --draw       ← 셋 다 뽑는다
 *   npx tsx engine/tools/lie_faces.mts --draw han   ← 한 사람만
 *   npx tsx engine/tools/lie_faces.mts --use-sheet  ← 이미 그린 시트로 다시 자른다(그림값 0)
 *
 * ## 왜 표정이 아니라 **단계**인가
 *
 * 두근도트의 여섯 칸은 감정(기쁨·수줍음…)이다. 취조실에는 그게 없다 — 여기서 얼굴이 말해야
 * 하는 것은 **얼마나 몰렸나**다. 지금까지는 사진 한 장에 CSS 로 붉은 기를 얹었다. 그건 얼굴이
 * 바뀌는 게 아니라 **색이 바뀌는 것**이라, 형사가 얼굴에서 읽을 것이 없었다.
 * 세계관 ②(온도계는 어긋날 수 있는 기계, **얼굴은 진짜를 따른다**)가 서려면 얼굴이 읽혀야 한다.
 *
 * 그래서 같은 3×2 시트에 **몰리는 여섯 단계**를 그린다. 만드는 길은 두근도트 것 그대로다
 * (한 장에 그려 자르기 → 기준 격자로 뭉개기 → 흰 테두리 → 바닥 맞추기) — 길을 새로 파면
 * 기준이 또 복사본이 된다([[standard-copied-into-three-tools]]).
 *
 * ## 생김새는 사장님이 적은 `겉모습` 에서 온다
 *
 * 10-01 에 반실사 얼굴을 뽑을 때 쓴 주문(`engine/work/lie/얼굴.mts`)에서 **사람 묘사만** 가져왔다.
 * 표정 낱말("composed", "frightened")은 뺐다 — 표정은 이제 단계가 정한다.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
import sharp from "sharp";
const { createImageProvider } = await import("../../src/lib/providers/images");
const { cutSheet, pixelize, dropToBaseline } = await import("../../src/lib/dot/sprites");
const { outlineSprite, outlineShare, OUTLINE_MIN } = await import("../../src/lib/dot/outline");
const { 격자, 도트, 본 } = await import("../../src/lib/dot/charStandard");

/** 몰리는 여섯 단계 — **칸 순서가 곧 파일 이름**이다. 화면(`취조실.tsx`)이 같은 이름을 쓴다. */
export const STAGES = ["calm", "tense", "rattled", "angry", "cornered", "broken"] as const;
const 단계글: Record<(typeof STAGES)[number], string> = {
  calm: "calm and composed, polite closed mouth, steady eyes looking forward",
  tense: "nervous, a stiff forced little smile, eyes glancing to the side, one sweat drop on the temple",
  rattled: "startled and flustered, eyes wide open, mouth slightly open, two sweat drops",
  angry: "angry, brows pulled down hard, glaring, teeth clenched",
  cornered: "cornered and close to tears, brows raised in distress, trembling lips, wet eyes",
  broken: "broken down, head lowered, eyes squeezed shut, tears running down both cheeks",
};

const 사람 = [
  { key: "han", 이름: "한선호", 생김새: "a Korean man in his early forties with neat short black hair, wearing a tidy dark suit, white shirt and dark tie" },
  { key: "yun", 이름: "윤미래", 생김새: "a Korean woman in her late thirties with shoulder-length dark hair slightly undone, swollen tired eyes, wearing a worn beige cardigan" },
  { key: "park", 이름: "박태수", 생김새: "a Korean man in his fifties with unkempt grey-streaked hair and stubble, a weathered face, wearing a worn-out dark green jacket" },
];

const args = process.argv.slice(2);
const 그릴까 = args.includes("--draw");
const 시트다시 = args.includes("--use-sheet");
const 누구 = 사람.filter((p) => !args.some((a) => 사람.some((q) => q.key === a)) || args.includes(p.key));

const SHEET = "C:/Users/az518/Desktop/두근도트-시트";
mkdirSync(`${SHEET}/lie`, { recursive: true });

/** 두근도트의 `restylePrompt` 와 **같은 문장**에 칸 설명만 단계로 바꾼다 — 화풍 줄은 한 글자도 안 바꾼다. */
const 주문 = (생김새: string) => [
  `Redraw this expression sheet with a DIFFERENT character, keeping the art style EXACTLY the same.`,
  `Keep: the same 3x2 grid of 6 cells, the same chunky low-resolution pixel art, the same crisp hard pixel edges,`,
  `the same limited flat palette treatment, the same bust framing and character size within each cell,`,
  `the same super-deformed chibi proportions (big round head, tiny shoulders, simple face).`,
  `Background: one flat solid pure magenta color (#FF00FF) behind everything, including the gutters — NOT transparent, NOT a checkerboard.`,
  `Change ONLY who the character is. The new character: ${생김새}.`,
  `All 6 cells must show this same new character, identical hair and clothing in every cell, only the expression changes.`,
  `Cells in order: ${STAGES.map((s, i) => `${i + 1}. ${단계글[s]}`).join(" ")}`,
  `No text, no labels, no numbers, no grid lines, no borders, no speech bubbles, no motion lines.`,
].join(" ");

if (!그릴까 && !시트다시) {
  console.log(`규격: 격자 ${격자}(도트 ${도트}) · 본 ${본} · 단계 ${STAGES.join(" → ")}\n`);
  for (const p of 누구) console.log(`  ${p.이름}(${p.key}) — ${p.생김새}`);
  console.log("\n`--draw` 를 붙이면 실제로 뽑습니다(사람당 그림 한 장).");
  process.exit(0);
}

const drawer = createImageProvider();
let 떨어짐 = 0;
for (const p of 누구) {
  const 시트길 = `${SHEET}/lie/${p.key}-sheet.png`;
  let dataUrl: string;
  if (시트다시 && existsSync(시트길)) {
    dataUrl = "data:image/png;base64," + readFileSync(시트길).toString("base64");
    console.log(`${p.이름} — 있던 시트를 쓴다(그림값 0)`);
  } else {
    const 참조 = "data:image/png;base64," + readFileSync(`${SHEET}/${본}-sheet.png`).toString("base64");
    const t0 = Date.now();
    const made = await drawer.edit(참조, 주문(p.생김새), "1536x1024", "medium");
    dataUrl = made.dataUrl;
    writeFileSync(시트길, Buffer.from(dataUrl.split(",")[1], "base64"));
    console.log(`${p.이름} — ${((Date.now() - t0) / 1000).toFixed(1)}s · 토큰 in ${made.inputTokens} out ${made.outputTokens}`);
  }

  const 칸들 = await cutSheet(dataUrl);
  if (칸들.length !== STAGES.length) { console.log(`   ❌ 칸 ${칸들.length}개 (6이어야 한다)`); 떨어짐++; continue; }
  mkdirSync(`public/lie/${p.key}`, { recursive: true });
  const 줄: Buffer[] = [];
  let 낮은테 = 0;
  for (const [i, c] of 칸들.entries()) {
    let png = await pixelize(c.png, 격자);
    png = (await outlineSprite(png, 도트, { 식: "한색", 색: [255, 255, 255] }, 1)).png;
    png = await dropToBaseline(png);
    if ((await outlineShare(png, 도트)).비율 < OUTLINE_MIN) 낮은테++;
    writeFileSync(`public/lie/${p.key}/${STAGES[i]}.png`, png);
    줄.push(png);
  }
  /* 여섯 칸을 한 줄로 — 사람이 "같은 사람인가 · 단계가 읽히나" 를 한눈에 본다. */
  const 칸 = 256;
  await sharp({ create: { width: 칸 * 6, height: 칸, channels: 4, background: { r: 28, g: 30, b: 38, alpha: 1 } } })
    .composite(await Promise.all(줄.map(async (b, i) => ({ input: await sharp(b).resize(칸, 칸, { kernel: "nearest" }).png().toBuffer(), left: i * 칸, top: 0 }))))
    .png().toFile(`${SHEET}/lie/${p.key}-strip.png`);
  console.log(`   ${낮은테 ? `❌ 테두리 낮은 칸 ${낮은테}` : "✅ 여섯 칸 · 테두리"} · 미리보기 ${SHEET}/lie/${p.key}-strip.png`);
  if (낮은테) 떨어짐++;
}
if (떨어짐) process.exit(1);
