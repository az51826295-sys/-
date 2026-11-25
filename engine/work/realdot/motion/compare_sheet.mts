// 우리(위) vs 픽셀랩(아래) 나란히 — 같은 순서(앞·오른쪽·뒤·왼쪽), 같은 배율. 칸 수·색 수도 잰다. 돈 0.
import sharp from "sharp";
const R = "C:/Users/az518/Desktop/두근도트-스레드/realdot";
const S = 5;
async function facts(png: Buffer) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const cols = new Set<number>(); let top = -1, bot = -1, l = info.width, r = -1, semi = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) { const i = (y * info.width + x) * 4; const a = data[i + 3]; if (!a) continue; if (a < 255) semi++; cols.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]); if (top < 0) top = y; bot = y; l = Math.min(l, x); r = Math.max(r, x); }
  return { h: bot - top + 1, w: r - l + 1, colors: cols.size, semi };
}
// 우리: 2판(turn3b) 1배 시트를 4칸으로
const ours = await sharp(`${R}/first-create/turn3b-sheet-1x.png`).toBuffer();
const om = await sharp(ours).metadata();
const cw = om.width! / 4;
const ourCells: Buffer[] = [];
for (let i = 0; i < 4; i++) ourCells.push(await sharp(ours).extract({ left: Math.round(i * cw), top: 0, width: Math.round(cw), height: om.height! }).png().toBuffer());
const plCells: Buffer[] = [];
for (const d of ["south", "east", "north", "west"]) plCells.push(await sharp(`${R}/pixellab/${d}.png`).png().toBuffer());
for (const [name, cells] of [["우리", ourCells], ["픽셀랩", plCells]] as const) {
  const f = await Promise.all(cells.map(facts));
  console.log(name, f.map((x) => `${x.w}×${x.h} ${x.colors}색${x.semi ? ` 반투명${x.semi}` : ""}`).join(" | "));
}
const plH = Math.max(...(await Promise.all(plCells.map(async (b) => (await sharp(b).metadata()).height!))));
const plW = Math.max(...(await Promise.all(plCells.map(async (b) => (await sharp(b).metadata()).width!))));
console.log("픽셀랩 그림 크기", plW, "×", plH);
const cell = Math.max(64, plW, plH) * S, gap = 16;
const place = async (b: Buffer) => sharp(b).resize({ height: (await sharp(b).metadata()).height! * S, kernel: "nearest" }).png().toBuffer();
const comp: sharp.OverlayOptions[] = [];
for (let i = 0; i < 4; i++) {
  comp.push({ input: await place(ourCells[i]), left: i * (cell + gap) + 8, top: 8 });
  comp.push({ input: await place(plCells[i]), left: i * (cell + gap) + 8, top: cell + 40 });
}
await sharp({ create: { width: 4 * (cell + gap) + 8, height: 2 * cell + 56, channels: 4, background: "#ffffff" } }).composite(comp).png().toFile(`${R}/compare-ours-vs-pixellab.png`);
console.log("ok");
