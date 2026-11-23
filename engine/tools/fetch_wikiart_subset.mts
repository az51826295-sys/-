/**
 * WikiArt 에서 화풍 판정 시험지용 그림만 받는다(11-23, 사장님 허락: 약 400장).
 * 인상주의 풍경을 그린 화가 여럿 — "같은 화풍 다른 화가" 가 어려운 다름 쌍이 되게.
 * 그림은 긴 변 512px JPEG 로 줄여 engine/work/datasets/wikiart/ 에 둔다(git 밖, 어디에도 안 올림).
 *
 *   npx tsx engine/tools/fetch_wikiart_subset.mts
 */
import sharp from "sharp";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";

const OUT = "engine/work/datasets/wikiart";
mkdirSync(OUT, { recursive: true });
const ARTISTS: [string, number][] = [
  ["claude-monet", 4], ["camille-pissarro", 2], ["eugene-boudin", 6], ["childe-hassam", 3],
  ["maxime-maufra", 39], ["pierre-auguste-renoir", 17], ["vincent-van-gogh", 22], ["paul-cezanne", 16],
];
const PER = 50, LANDSCAPE = 4;
const meta: { file: string; artist: string; style: number; genre: number }[] = [];
for (const [name, idx] of ARTISTS) {
  const where = encodeURIComponent(`"artist"=${idx} AND "genre"=${LANDSCAPE}`);
  const url = `https://datasets-server.huggingface.co/filter?dataset=huggan/wikiart&config=default&split=train&where=${where}&offset=0&length=${PER}`;
  let j: any = {};
  for (let t = 0; t < 6; t++) { j = await (await fetch(url)).json(); if (j.rows) break; await new Promise((r) => setTimeout(r, 15000)); }
  if (!j.rows) { console.log(name, "실패", j.error?.slice(0, 80)); continue; }
  let n = 0;
  for (const r of j.rows) {
    const file = `${name}_${r.row_idx}.jpg`;
    if (!existsSync(`${OUT}/${file}`)) {
      const res = await fetch(r.row.image.src);
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      await sharp(buf).resize(512, 512, { fit: "inside" }).jpeg({ quality: 85 }).toFile(`${OUT}/${file}`);
    }
    meta.push({ file, artist: name, style: r.row.style, genre: r.row.genre });
    n++;
  }
  console.log(name, n);
}
writeFileSync(`${OUT}/meta.json`, JSON.stringify(meta, null, 1));
console.log("합계", meta.length);
