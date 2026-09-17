/**
 * 잘림 자 (97회차 09-13, 사장님 "이거 잘 안 잘린 거 맞지?") — 표정 스프라이트·얼굴이 그림 테두리에 닿으면 잘린 것이다.
 *   모든 인물의 sprites(표정 전신)·faces(얼굴) 를 내려받아, 네 테두리 각각에 불투명 픽셀이 몇 개 있는지 센다.
 *   아래 테두리(발·몸통이 시트 바닥에 닿는 것)는 봐준다 — 왼·오른·위 가 닿으면 ❌.
 *   npx tsx engine/tools/dot_sprite_edge_check.mts [--all]   (--all: 통과한 것도 다 찍는다)
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) { const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0,i).trim()] = l.slice(i+1).trim(); }
import sharp from "sharp";
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const { data: chars } = await db.from("dot_characters").select("slug, name, sprites, faces").neq("slug", "test-plumbing").order("slug");
const all = process.argv.includes("--all");
let bad = 0, total = 0;
for (const c of chars ?? []) {
  const entries: [string, string][] = [...Object.entries((c.sprites ?? {}) as Record<string, string>), ...Object.entries((c.faces ?? {}) as Record<string, string>).map(([k, v]) => [`face:${k}`, v] as [string, string])];
  for (const [key, url] of entries) {
    if (!url) continue;
    total++;
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const W = info.width, H = info.height, ch = info.channels;
    const a = (x: number, y: number) => data[(y * W + x) * ch + 3] > 127;
    let left = 0, right = 0, top = 0, bottom = 0;
    for (let y = 0; y < H; y++) { if (a(0, y)) left++; if (a(W - 1, y)) right++; }
    for (let x = 0; x < W; x++) { if (a(x, 0)) top++; if (a(x, H - 1)) bottom++; }
    const clipped = left > 0 || right > 0 || top > 0;
    if (clipped) bad++;
    if (clipped || all) console.log(`  ${clipped ? "❌" : "✅"} ${c.name} ${key} ${W}×${H} · 왼 ${left} 오른 ${right} 위 ${top} 아래 ${bottom}`);
  }
}
console.log(`${total}장 중 잘린 것 ${bad}장`);
process.exit(bad ? 1 : 0);
