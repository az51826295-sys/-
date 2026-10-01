/**
 * **거짓말의 온도 — 용의자 얼굴** (228회차 10-01). 그림값이 든다(약 $0.03).
 *   npx tsx engine/tools/rookery_env.mts engine/work/lie/얼굴.mts [--draw]
 *
 * ## 규격을 먼저 못 박는다
 * 09-30 도트에서 배운 것: **규격 없이 뽑으면 크기도 결도 제각각**이 된다(슬라임 42 · 골렘 47).
 * 그래서 얼굴도 표를 먼저 정한다 — 같은 거리, 같은 조명, 같은 결. 다른 것은 **사람**뿐이어야 한다.
 *
 *  · 448×448 · 가슴 위(bust) · 정면 · 눈높이가 위에서 40% 자리
 *  · 취조실 조명: 위에서 떨어지는 센 빛, 뒤는 어둡다
 *  · 결: 무채색에 가까운 누아르 삽화, 색은 적게
 *
 * 생김새는 **사장님이 적은 `겉모습` 그대로**다. 내가 지어낸 것이 아니다.
 */
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";

const 그릴까 = process.argv.includes("--draw");
const 낼곳 = "public/lie";
mkdirSync(낼곳, { recursive: true });
mkdirSync("engine/work/lie/원본", { recursive: true });

/** 모든 얼굴이 공유하는 틀. 한 낱말이라도 바뀌면 결이 흔들린다. */
const 틀 = [
  "Muted noir illustration, desaturated palette of greys and cold blues with one warm accent.",
  "Head-and-shoulders bust portrait, centered, facing the camera, eyes at about 40% from the top.",
  "Harsh single overhead interrogation-room light from above, deep shadows, dark plain background.",
  "Painterly but clean, no text, no logo, no border, no frame.",
].join(" ");

const 목록 = [
  { id: "A", key: "han", 이름: "한선호", 주문: "A Korean man in his early forties wearing a neat dark suit and tie, composed and polite expression, faint redness around the eyes as if he has been crying, hands out of frame" },
  { id: "B", key: "yun", 이름: "윤미래", 주문: "A Korean woman in her late thirties, swollen eyes from crying, hair slightly undone, tense jaw, a worn cardigan, looking back at the viewer with irritation" },
  { id: "C", key: "park", 이름: "박태수", 주문: "A Korean man in his fifties with unkempt hair and stubble, worn-out jacket, frightened eyes avoiding the camera, trembling look, weathered face" },
];

if (!그릴까) {
  console.log("규격: 448×448 · 가슴 위 · 정면 · 취조실 조명 · 누아르 삽화\n");
  for (const m of 목록) console.log(`  ${m.이름}(${m.key}) — ${m.주문.slice(0, 66)}…`);
  console.log("\n`--draw` 를 붙이면 실제로 뽑습니다(약 $0.03).");
  process.exit(0);
}

const { createImageProvider } = await import("../../../src/lib/providers/images");
const 그리개 = createImageProvider();
let 토큰 = { input: 0, output: 0 };

for (const m of 목록) {
  process.stdout.write(`${m.이름} 뽑는 중… `);
  try {
    const img = await 그리개.draw(`${m.주문}. ${틀}`, "low");
    토큰 = { input: 토큰.input + img.inputTokens, output: 토큰.output + img.outputTokens };
    const 원본 = Buffer.from(img.dataUrl.split(",")[1], "base64");
    writeFileSync(`engine/work/lie/원본/${m.key}.png`, 원본);
    // 448 정사각으로 맞춘다. 생성기가 1024 정사각을 주니 비율은 그대로 줄기만 한다.
    const 다듬 = await sharp(원본).resize(448, 448, { fit: "cover", position: "top" })
      .jpeg({ quality: 86, mozjpeg: true }).toBuffer();
    writeFileSync(`${낼곳}/${m.key}.jpg`, 다듬);
    console.log(`${Math.round(다듬.length / 1024)}KB`);
  } catch (e) {
    console.log(`실패 — ${e instanceof Error ? e.message : e}`);
  }
}
const 값 = (토큰.input * 5 + 토큰.output * 30) / 1_000_000;
console.log(`\n**${목록.length}장** · 그림값 약 $${값.toFixed(4)} → ${낼곳}/`);
