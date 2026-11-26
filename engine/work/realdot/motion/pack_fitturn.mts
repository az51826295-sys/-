// itch-pack4 의 4방향을 기본 그림 키에 맞춘다(돈 0) → turn-1x.png · turn.gif 덮어쓰기(원본은 turn-orig-1x.png 로 남김)
import { readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import sharp from "sharp";
const { fitTurn } = await import("../../../../src/lib/pixel/fitturn");
const { gifOf } = await import("../../../../src/lib/pixel/frames");
const D = "C:/Users/az518/Desktop/두근도트-스레드/itch-pack4";
for (const n of process.argv.slice(2)) {
  const orig = `${D}/${n}/turn-orig-1x.png`;
  if (!existsSync(orig)) copyFileSync(`${D}/${n}/turn-1x.png`, orig);
  const r = await fitTurn(readFileSync(`${D}/${n}/front.png`), readFileSync(orig));
  const set = { frames: [], cellW: r.cellW, cellH: r.cellH, bg: null, how: "grid" as const };
  const sheet = await sharp({ create: { width: r.cellW * 4, height: r.cellH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(r.frames.map((input, i) => ({ input, raw: { width: r.cellW, height: r.cellH, channels: 4 as const }, left: i * r.cellW, top: 0 }))).png().toBuffer();
  writeFileSync(`${D}/${n}/turn-1x.png`, sheet);
  writeFileSync(`${D}/${n}/turn.gif`, await gifOf(r.frames, set, { scale: Math.max(1, Math.floor(512 / r.cellH)), ms: 500 }));
  console.log(n.padEnd(9), r.facts.join(" · "));
}
