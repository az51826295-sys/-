/**
 * **도트 조각을 규격에 맞춰 뽑는다** (228회차 10-01). 그림값이 든다.
 *   npx tsx engine/tools/rookery_env.mts engine/work/sprites/만들기.mts [--draw]
 *
 * ## 10-01 사장님: "그 도트에 크기가 일정해야 해"
 * 첫 판은 조각마다 48×48 을 **꽉 채우게** 만들었다. 그래서 재 보니:
 *   슬라임 높이 42 · 골렘 47 → **덩치 차이가 사라졌다.** 폭은 11(빙결)~48(슬라임) 로 제멋대로.
 *   게다가 진짜 도트 격자 위에 있지도 않았다(같은 색이 1칸씩만 이어졌다).
 *
 * ## 그래서 규격을 못 박는다
 *  ① **도트 한 칸 = 2 화면 픽셀.** 24칸 격자에 그리고 ×2 로 키운다(48×48). 모든 조각이 같다.
 *  ② **키는 정해진 대로 다르다.** 같으면 안 된다 — 슬라임은 작고 골렘은 커야 한다. 표는 아래.
 *  ③ **바닥이 맞는다.** 전부 아래에 붙이고 가로는 가운데.
 *  ④ 원본(1024)을 **남긴다.** 첫 판에 안 남겨서 다시 뽑아야 했다.
 *
 * 키는 내가 정한 값이다(사장님이 바꾸라 하시면 표만 고치면 된다).
 */
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";

const 그릴까 = process.argv.includes("--draw");
const 칸 = "engine/work/sprites";
const 볼곳 = "C:/Users/az518/Desktop/로키-도트조각";
mkdirSync(`${칸}/png`, { recursive: true });
mkdirSync(`${칸}/원본`, { recursive: true });
mkdirSync(볼곳, { recursive: true });

/** 격자 24칸 · 화면 48(한 칸 2픽셀). */
const 격자 = 24, 배 = 2;

/** 도트로 보이게 하는 공통 주문. 한 낱말이라도 "사실적" 쪽으로 새면 도트가 안 나온다. */
const 결 = [
  "16-bit pixel art sprite on a coarse pixel grid, crisp hard pixel edges, no anti-aliasing, no gradients,",
  "limited palette of 6-10 flat colors, bold dark outline, centered single subject,",
  "front-facing, whole body visible with a little empty margin, standing on nothing,",
  "fully transparent background, no shadow, no ground, no text.",
].join(" ");

/** `키` 는 24칸 중 몇 칸을 차지하나. **이것이 덩치 차이다.** */
const 목록: { key: string; 한글: string; 키: number; 주문: string }[] = [
  { key: "enemy_weak", 한글: "약한 적", 키: 13, 주문: "a small round green slime monster with two simple eyes, wobbly body" },
  { key: "enemy_fast", 한글: "빠른 적", 키: 17, 주문: "a lean blue imp with bat wings and pointed ears, leaning forward as if running" },
  { key: "enemy_tank", 한글: "튼튼한 적", 키: 22, 주문: "a bulky grey stone golem with heavy armored shoulders and glowing orange cracks" },
  { key: "tower_arrow", 한글: "화살 타워", 키: 19, 주문: "a small stone watchtower with a wooden roof and a crossbow mounted on top, blue banner" },
  { key: "tower_cannon", 한글: "대포 타워", 키: 16, 주문: "a squat wide stone turret with a thick black cannon barrel pointing right, orange trim" },
  { key: "tower_frost", 한글: "얼음 타워", 키: 21, 주문: "a chunky ice crystal tower with thick pale cyan shards and a glowing blue orb on top" },
];

/**
 * 규격에 맞춘다: 빈 둘레를 떼고 → **정해진 키**로 줄이고 → 24칸 격자에 **아래·가운데**로 놓고 → ×2.
 * 줄일 때는 보통 방식(부드럽게)으로 줄인 뒤 색을 줄여 도트처럼 만들고, **키울 때만** `nearest` 를 쓴다.
 * (줄일 때 nearest 를 쓰면 점이 들쭉날쭉 빠져 모양이 깨진다.)
 */
async function 규격맞춤(원본: Buffer, 키: number): Promise<Buffer> {
  const 떼낸것 = await sharp(원본).trim({ threshold: 10 }).toBuffer();
  const m = await sharp(떼낸것).metadata();
  const 비율 = (m.width ?? 1) / (m.height ?? 1);
  const h = 키;
  const w = Math.max(1, Math.min(격자 - 2, Math.round(키 * 비율)));
  const 작게 = await sharp(떼낸것).resize(w, h, { fit: "fill", kernel: "lanczos3" })
    .png({ palette: true, colors: 12, dither: 0 }).toBuffer();
  const 판 = await sharp({ create: { width: 격자, height: 격자, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: 작게, left: Math.round((격자 - w) / 2), top: 격자 - h }])   // 아래·가운데
    .png().toBuffer();
  return sharp(판).resize(격자 * 배, 격자 * 배, { kernel: "nearest" }).png({ palette: true, colors: 16, dither: 0 }).toBuffer();
}

type 조각 = { key: string; 한글: string; dataUrl: string; 바이트: number };
const 조각들: 조각[] = [];

if (!그릴까) {
  console.log(`규격: 격자 ${격자}칸 · 화면 ${격자 * 배}픽셀(한 칸 ${배}픽셀) · 바닥 맞춤 · 가로 가운데\n`);
  console.log("조각            키(칸)  주문");
  for (const m of 목록) console.log(`  ${m.key.padEnd(13)} ${String(m.키).padStart(4)}   ${m.주문.slice(0, 54)}…`);
  console.log("\n`--draw` 를 붙이면 실제로 뽑습니다(그림값 약 $0.04).");
  process.exit(0);
}

const { createImageProvider } = await import("../../../src/lib/providers/images");
const 그리개 = createImageProvider();
let 들인토큰 = { input: 0, output: 0 };

for (const m of 목록) {
  process.stdout.write(`${m.한글}(${m.key}, 키 ${m.키}칸) 뽑는 중… `);
  try {
    const img = await 그리개.draw(`${m.주문}. ${결}`, "low");
    들인토큰 = { input: 들인토큰.input + img.inputTokens, output: 들인토큰.output + img.outputTokens };
    const 원본 = Buffer.from(img.dataUrl.split(",")[1], "base64");
    writeFileSync(`${칸}/원본/${m.key}.png`, 원본);                 // **원본을 남긴다**
    const 다듬 = await 규격맞춤(원본, m.키);
    const dataUrl = `data:image/png;base64,${다듬.toString("base64")}`;
    조각들.push({ key: m.key, 한글: m.한글, dataUrl, 바이트: 다듬.length });
    writeFileSync(`${칸}/png/${m.key}.png`, 다듬);
    writeFileSync(`${볼곳}/${m.key}.png`, 다듬);
    writeFileSync(`${볼곳}/${m.key}-크게.png`, await sharp(다듬).resize(288, 288, { kernel: "nearest" }).png().toBuffer());
    console.log(`${다듬.length}바이트`);
  } catch (e) {
    console.log(`실패 — ${e instanceof Error ? e.message : e}`);
  }
}

if (!조각들.length) { console.error("한 장도 못 뽑았다"); process.exit(1); }

const js = [
  "// 로키가 뽑은 도트 조각 꾸러미. **이 파일은 고치지 마라.**",
  "// 그림을 글자로 담아 뒀다 — 판은 바깥 요청이 막힌 창에서 돌아서 주소로는 못 불러온다.",
  "// 쓰는 법:  import { SPRITES, sprite } from './sprites.js';",
  "//           ctx.drawImage(sprite('enemy_fast'), x - 24, y - 24, 48, 48);",
  "//",
  `// **규격**: 한 장 ${격자 * 배}×${격자 * 배} · 도트 한 칸 ${배}픽셀(격자 ${격자}칸) · 조각마다 키가 다르고 **바닥이 맞다**.`,
  "// 그러니 **늘 48×48 그대로 그려라.** 크기를 조각마다 다르게 늘리면 도트 칸이 어긋나고 덩치 차이가 깨진다.",
  "// 발이 닿는 선은 그림의 아래끝이다 — 길 위에 세울 때 `y + 24` 가 발밑이 되게 그린다.",
  ...목록.filter((m) => 조각들.some((s) => s.key === m.key)).map((m) => `//   ${m.key.padEnd(13)} 키 ${m.키}/${격자}칸`),
  "",
  "export const SPRITES = {",
  ...조각들.map((s) => `  // ${s.한글}\n  ${s.key}: "${s.dataUrl}",`),
  "};",
  "",
  "const _이미지 = {};",
  "/** 키를 주면 그려 넣을 수 있는 그림을 돌려준다(한 번만 만든다). */",
  "export function sprite(key) {",
  "  if (!_이미지[key]) { const im = new Image(); im.src = SPRITES[key]; _이미지[key] = im; }",
  "  return _이미지[key];",
  "}",
  "",
  "/** 다 읽힐 때까지 기다린다. 첫 화면에서 빈 칸이 보이지 않게. */",
  "export function spritesReady() {",
  "  return Promise.all(Object.keys(SPRITES).map((k) => new Promise((done) => {",
  "    const im = sprite(k);",
  "    if (im.complete) done(); else { im.onload = () => done(); im.onerror = () => done(); }",
  "  })));",
  "}",
  "",
].join("\n");
writeFileSync(`${칸}/sprites.js`, js);

const kb = Math.round(js.length / 1024);
const 값 = (들인토큰.input * 5 + 들인토큰.output * 30) / 1_000_000;
console.log(`\n**${조각들.length}장** · 꾸러미 ${kb}KB · 그림값 약 $${값.toFixed(4)}`);
console.log(`  규격: 격자 ${격자}칸 · 한 칸 ${배}픽셀 · 바닥 맞춤`);
console.log(`  꾸러미: ${칸}/sprites.js · 원본: ${칸}/원본/`);
console.log(`  재 보기: npx tsx engine/work/sprites/크기자.mts`);
