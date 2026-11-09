/** 지금 가진 재료 — 벽지·사진·스프라이트 크기와 수. 새 사진을 **그리지 않고** 만들 수 있나 보려고. */
import { readdirSync, existsSync } from "node:fs";
const sharp = (await import("sharp")).default;
for (const f of readdirSync("public/wallpapers")) {
  const m = await sharp(`public/wallpapers/${f}`).metadata();
  console.log(`벽지 ${f.padEnd(12)} ${m.width}x${m.height}`);
}
for (const slug of ["rin", "yuna", "doyun", "haru", "nabi", "seoha", "yeonu"]) {
  const d = `public/dot-sprites/${slug}/photo`;
  const n = existsSync(d) ? readdirSync(d) : [];
  if (n.length) {
    const m = await sharp(`${d}/${n[0]}`).metadata();
    console.log(`사진 ${slug.padEnd(7)} ${n.length}장 · ${m.width}x${m.height}`);
  } else console.log(`사진 ${slug.padEnd(7)} 없음`);
  const s = await sharp(`public/dot-sprites/${slug}/neutral.png`).metadata();
  console.log(`   스프라이트 ${s.width}x${s.height}`);
}
