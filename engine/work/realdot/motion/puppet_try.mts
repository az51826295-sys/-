// 11-27 A 방식(꼭두각시) 시험(돈 0): rival/<이름>/walk-A*.  npx tsx puppet_try.mts [sway] [lift]
import sharp from "sharp";
import { writeFileSync, mkdirSync } from "node:fs";
const { puppetWalk } = await import("../../../../src/lib/pixel/puppet");
const { sheetOf, gifOf } = await import("../../../../src/lib/pixel/motion");
const D = "C:/Users/az518/Desktop/두근도트-스레드";
const sway = process.argv[2] !== undefined ? Number(process.argv[2]) : undefined, lift = process.argv[3] ? Number(process.argv[3]) : undefined;
const tag = process.argv[4] ?? "A";
for (const [name, path] of [["mage", `${D}/itch-pack4/mage/front.png`], ["knight", `${D}/itch-pack4/knight/front.png`], ["king", `${D}/rival/king/front.png`]]) {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const r = puppetWalk({ data, w: info.width, h: info.height }, { sway, lift });
  const set = { frames: [], cellW: r.cellW, cellH: r.cellH, bg: null, how: "grid" } as never;
  mkdirSync(`${D}/rival/${name}`, { recursive: true });
  writeFileSync(`${D}/rival/${name}/walk-${tag}-1x.png`, await sheetOf(r.frames, set));
  writeFileSync(`${D}/rival/${name}/walk-${tag}.gif`, await gifOf(r.frames, set, { scale: 6, ms: 180 }));
  console.log(name, r.facts.join(" · "));
}
