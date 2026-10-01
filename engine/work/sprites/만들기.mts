/**
 * **도트 조각을 뽑아 게임에 넣을 꾸러미로 만든다** (228회차 10-01). 그림값이 든다.
 *   npx tsx engine/tools/rookery_env.mts engine/work/sprites/만들기.mts [--draw]
 *
 * 사장님 "캐릭터는 어캐 했어?" → 타워 디펜스 7판 내내 적은 **빨간 동그라미**였다.
 * 내가 주문에 "그림은 코드로 그려라" 라고 적었기 때문이다(한계 시험이라 그림을 뺐다).
 * 사장님이 고른 길: **도트 그림을 먼저 만들고, 그 그림을 쓰는 게임을 짓게 한다.**
 *
 * ## 왜 꾸러미(data URI)인가
 * 판은 **바깥 요청이 막힌 창**에서 돈다(서버 열쇠가 그 코드 안에 있으면 안 되니까).
 * 그래서 그림 **주소**로는 못 불러온다. 그림을 글자로 바꿔 파일 안에 넣는다 —
 * 48×48 도트 한 장이 2~4KB 라 여섯 장이면 20KB 안쪽이다.
 *
 * ## 하는 일
 *  ① 여섯 장을 뽑는다(적 3 · 타워 3) — 투명 바탕, 낮은 품질(도트라 어차피 줄인다)
 *  ② **빈 둘레를 잘라내고** 48×48 로 줄인다. 줄일 때 `nearest` 를 쓴다 — 도트는 흐려지면 죽는다
 *  ③ `js/sprites.js` 한 파일로 묶는다. 게임은 `SPRITES.enemy_fast` 처럼 쓴다
 *  ④ 사람이 눈으로 볼 수 있게 PNG 도 따로 남긴다
 */
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";

const 그릴까 = process.argv.includes("--draw");
const 칸 = "engine/work/sprites";
const 볼곳 = "C:/Users/az518/Desktop/로키-도트조각";
mkdirSync(`${칸}/png`, { recursive: true });
mkdirSync(볼곳, { recursive: true });

/** 도트로 보이게 하는 공통 주문. 한 낱말이라도 "사실적" 쪽으로 새면 도트가 안 나온다. */
const 결 = [
  "16-bit pixel art sprite, crisp hard pixel edges, no anti-aliasing, no gradients,",
  "limited palette of 6-10 flat colors, bold dark outline, centered single subject,",
  "front-facing, full body inside frame, fully transparent background, no shadow, no ground, no text.",
].join(" ");

const 목록: { key: string; 한글: string; 주문: string }[] = [
  { key: "enemy_weak", 한글: "약한 적", 주문: "a small round green slime monster with two simple eyes, wobbly body" },
  { key: "enemy_fast", 한글: "빠른 적", 주문: "a small lean blue imp with bat wings and pointed ears, leaning forward as if running" },
  { key: "enemy_tank", 한글: "튼튼한 적", 주문: "a bulky grey stone golem with heavy armored shoulders and glowing orange cracks" },
  { key: "tower_arrow", 한글: "화살 타워", 주문: "a small stone watchtower with a wooden roof and a crossbow mounted on top, blue banner" },
  { key: "tower_cannon", 한글: "대포 타워", 주문: "a squat stone turret with a thick black cannon barrel pointing right, orange trim" },
  { key: "tower_frost", 한글: "얼음 타워", 주문: "a slender ice crystal tower with pale cyan shards and a glowing blue orb on top" },
];

type 조각 = { key: string; 한글: string; dataUrl: string; 바이트: number };
const 조각들: 조각[] = [];

if (!그릴까) {
  console.log("뽑을 것 (그림값이 듭니다 — `--draw` 를 붙이면 실제로 뽑습니다):");
  for (const m of 목록) console.log(`  ${m.key.padEnd(13)} ${m.한글.padEnd(7)} ${m.주문.slice(0, 60)}…`);
  console.log(`\n결: ${결.slice(0, 90)}…`);
  process.exit(0);
}

const { createImageProvider } = await import("../../../src/lib/providers/images");
const 그리개 = createImageProvider();
let 들인토큰 = { input: 0, output: 0 };

for (const m of 목록) {
  process.stdout.write(`${m.한글}(${m.key}) 뽑는 중… `);
  try {
    const img = await 그리개.draw(`${m.주문}. ${결}`, "low");
    들인토큰 = { input: 들인토큰.input + img.inputTokens, output: 들인토큰.output + img.outputTokens };
    const 원본 = Buffer.from(img.dataUrl.split(",")[1], "base64");
    // 빈 둘레를 잘라내고(투명 기준) 48×48 로. 도트는 **nearest** 로 줄여야 산다.
    const 다듬 = await sharp(원본).trim({ threshold: 10 })
      .resize(48, 48, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: "nearest" })
      .png({ compressionLevel: 9, palette: true })
      .toBuffer();
    const dataUrl = `data:image/png;base64,${다듬.toString("base64")}`;
    조각들.push({ key: m.key, 한글: m.한글, dataUrl, 바이트: 다듬.length });
    writeFileSync(`${칸}/png/${m.key}.png`, 다듬);
    writeFileSync(`${볼곳}/${m.key}.png`, 다듬);
    // 크게 본 것도 한 장(도트가 제대로 나왔는지 눈으로 보려고)
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
  "// 한 장은 48×48 이고, 가운데가 그 조각의 가운데다.",
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
console.log(`  꾸러미: ${칸}/sprites.js`);
console.log(`  눈으로: ${볼곳} (크게 한 장씩 같이 뒀다)`);
console.log(`  키: ${조각들.map((s) => s.key).join(", ")}`);
