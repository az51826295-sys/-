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
let bad = 0, total = 0, 못잼 = 0;
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
    // 226회차 09-28: **이 자가 얼굴을 잘못 재고 있었다.** 96장 중 48장을 ❌ 로 찍었는데
    // **48장이 전부 얼굴이었고 전신은 하나도 안 걸렸다** — 섞이지 않고 한 갈래가 통째로 떨어지면
    // 자를 먼저 의심한다([[constant-failure-means-a-rule-bug]]).
    //
    // 확인해 보니 `faceCrop` 은 **일부러** 얼굴을 꽉 차게 자른다("변은 살색 높이의 2.1배 —
    // 이마·머리·턱이 들어오게"). 얼굴 크롭은 머리카락이 테두리에 닿는 것이 **정상**이다.
    // 전신 규칙을 얼굴에 그대로 댄 것이 고장이었다. 나는 이 거짓 신호를 보고 하마터면
    // **멀쩡한 그림을 다시 그릴 뻔했다**(그림값이 든다).
    //
    // 얼굴을 재는 옳은 자가 아직 없으므로 **"못 잼" 으로 둔다** — 0 으로 세거나 통과로 세지 않는다.
    // 미측정은 실패도 성공도 아니다.
    const 얼굴 = key.startsWith("face:");
    const clipped = !얼굴 && (left > 0 || right > 0 || top > 0);
    if (얼굴) 못잼++;
    else if (clipped) bad++;
    if (clipped || all) console.log(`  ${clipped ? "❌" : "✅"} ${c.name} ${key} ${W}×${H} · 왼 ${left} 오른 ${right} 위 ${top} 아래 ${bottom}`);
    if (얼굴 && all) console.log(`  ◻︎ ${c.name} ${key} ${W}×${H} · 얼굴은 꽉 차게 자르는 것이 정상이라 이 자로는 **못 잰다**`);
  }
}
console.log(`${total}장 중 잘린 것 **${bad}장** · 이 자로 못 재는 얼굴 ${못잼}장`);
console.log("얼굴은 꽉 차게 자르는 것이 정상이라 전신 규칙으로 못 잰다 — **미측정은 실패도 성공도 아니다.**");
process.exit(bad ? 1 : 0);
