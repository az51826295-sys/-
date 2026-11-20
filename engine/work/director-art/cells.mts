// 거르기 시트(그림값 0)에서 무표정 칸을 운영과 같은 길로 다시 뽑는다.
import { readFileSync, writeFileSync } from "node:fs";
const { cutSheet, pixelize, dropToBaseline } = await import("../../../src/lib/dot/sprites");
const { outlineSprite } = await import("../../../src/lib/dot/outline");
const { 격자 } = await import("../../../src/lib/dot/charStandard");
for (const s of ["flare-low", "flare-medium", "sunburst-medium", "img2-medium"]) {
  const b64 = readFileSync(`engine/work/director-art/screen/${s}-yuna-sheet.png`).toString("base64");
  const cells = await cutSheet("data:image/png;base64," + b64);
  const n = cells.find((c) => c.emotion === "neutral")!;
  const p = await pixelize(n.png, 격자);
  const o = (await outlineSprite(p, 512 / 격자, { 식: "한색", 색: [255, 255, 255] }, 1)).png;
  writeFileSync(`engine/work/director-art/screen/${s}-yuna-neutral.png`, await dropToBaseline(o));
}
