// 이미 만든 캐릭터(1x)로 4방향만 손님 길대로(다시 그리기 1번까지). npx tsx turn_only.mts <1x.png> <출력 접두>
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
delete process.env.PIXEL_MOTION_MOCK;
const [ref, out] = process.argv.slice(2);
const { makeMotion, sheetOf, gifOf } = await import("../../../../src/lib/pixel/motion");
const t0 = Date.now();
const m = await makeMotion(readFileSync(ref), "turn");
console.log("4방향", m.ok, "판", m.tries, "$" + m.usd.toFixed(4), ((Date.now() - t0) / 1000).toFixed(0) + "초", JSON.stringify(m.check?.facts), m.ok ? "" : m.reason);
console.log("판단자:", m.check?.judge?.why);
if (m.ok) {
  const s = await sheetOf(m.cuts, m.set); writeFileSync(`${out}-1x.png`, s);
  const mm = await sharp(s).metadata();
  writeFileSync(`${out}-big.png`, await sharp(s).resize(mm.width! * 5, mm.height! * 5, { kernel: "nearest" }).png().toBuffer());
  writeFileSync(`${out}.gif`, await gifOf(m.cuts, m.set, { scale: 5, ms: 500 }));
}
