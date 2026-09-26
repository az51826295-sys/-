/**
 * **같은 캐릭터 그대로, 크기만 고쳐 다시 그린다** (226회차 2026-09-27).
 *
 * 사장님 "잘 짤랐는데 그림이 안 맞아" — 크기는 잡혔는데 **얼굴이 바뀌었다.** 맨땅에서 다시 그리면
 * 같은 설명이어도 다른 사람이 나온다(3D 에서 "같은 얼굴로 다시" 와 같은 자리, 09-06 17회차).
 * 그래서 지금 쓰고 있는 그림을 **참조로 눈앞에 놓고** 그린다 — 부탁이 아니라 보고 그리게 한다.
 *
 *   npx tsx engine/tools/rookery_env.mts engine/tools/dot_redraw_same.mts <참조png> <나갈폴더> [--run]
 */
import fs from "node:fs";
import { createImageProvider } from "../../src/lib/providers/images";
import { cutSheet, cleanSprite, SHEET_ORDER } from "../../src/lib/dot/sprites";

const ref = process.argv[2];
const out = process.argv[3];
const RUN = process.argv.includes("--run");
if (!ref || !out) throw new Error("사용: dot_redraw_same.mts <참조png> <나갈폴더> [--run]");

const FACE: Record<string, string> = {
  neutral: "calm neutral", happy: "big happy smile, eyes closed",
  shy: "shy, blushing cheeks, looking slightly away", sad: "sad, downturned eyes",
  angry: "angry, furrowed brows", surprised: "surprised, wide eyes, open mouth",
};
const cells = SHEET_ORDER.map((e, i) => `${i + 1}. ${FACE[e]}`).join(" ");
const prompt = [
  `Draw a 3x2 expression sheet of THE EXACT SAME CHARACTER shown in the reference image.`,
  `Keep everything about who she is identical to the reference: the same face, the same hairstyle and hair colour,`,
  `the same clothing, the same palette, the same chunky low-resolution pixel art style with hard square pixels and no anti-aliasing.`,
  `Do not invent a new person. Do not change her hair, her clothes or her colours.`,
  // 226회차 09-27: "칸을 꽉 채워라" 로 밀었더니 **넘쳐서 잘렸다**(사장님 "다 자르면 어떡해").
  // 크기를 키우는 것과 잘리는 것은 다른 일이다 — 여백을 명시하고, 잘림은 자로 막는다.
  `SIZE: the character takes up about 80% of the cell height and is CENTERED in her cell,`,
  `with a clear empty margin on all four sides — above her hair, below her body, and on both sides.`,
  `NOTHING may be cut off by the edge of a cell: not a strand of hair, not a shoulder, not her clothing.`,
  // 09-27: "아래 여백" 을 한 번 적었더니 위·좌·우만 생기고 **아래는 계속 칸 바닥에 닿았다.** 상반신 그림이라
  // 몸이 아래로 이어지는 것이 모델의 기본값이다 — 그래서 몸이 **어디서 끝나는지**까지 못 박는다.
  // 09-27 사장님 "일부러 좀 남길래? 여유롭게". 가슴에서 뚝 자르지 말고 **몸을 더 보여 준다** —
  // 아래 여백을 말로 두 번 시켰는데 모델은 계속 칸 바닥까지 그렸다. 그리는 범위를 바꾸는 쪽이 통한다.
  `FRAMING: draw her from the head down to the waist or hips, including both arms and hands, standing.`,
  `Leave a clearly empty band of background BELOW her — her body must not reach the bottom edge of the cell.`,
  `The same framing and the same empty band in all six cells.`,
  `She is the SAME SIZE in all six cells.`,
  `Six cells, left to right then top to bottom: ${cells}`,
  `Background: one flat solid pure magenta (#FF00FF) behind everything including the gutters — NOT transparent.`,
  `No text, no labels, no numbers, no grid lines, no borders.`,
].join(" ");

console.log(`참조: ${ref}`);
if (!RUN) { console.log("\n--run 을 붙이면 그린다($0.05쯤)."); process.exit(0); }

const b64 = fs.readFileSync(ref).toString("base64");
const t0 = Date.now();
const made = await createImageProvider().edit(`data:image/png;base64,${b64}`, prompt, "1024x1024", "high");
console.log(`그렸다 ${((Date.now()-t0)/1000).toFixed(0)}초 · ${made.model}`);
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(`${out}/_sheet.png`, Buffer.from(made.dataUrl.split(",")[1], "base64"));
for (const c of await cutSheet(made.dataUrl)) {
  fs.writeFileSync(`${out}/${c.emotion}.png`, await cleanSprite(c.png));
  console.log(`  ${c.emotion.padEnd(10)} 잉크 ${(c.inkRatio*100).toFixed(1)}%`);
}
