/** 심은 고장 — 떨어진 조각과 가장자리 잉크를 일부러 만들어 자가 잡는지 본다. 11-08. */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
const { createClient } = await import("@supabase/supabase-js");
const sharp = (await import("sharp")).default;
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data } = await db.from("dot_characters").select("slug, sprites, is_public");
const c = (data as any[]).find((x) => x.is_public && x.sprites?.neutral);
const 원본 = Buffer.from(await (await fetch(c.sprites.neutral)).arrayBuffer());

async function 살피기(png: Buffer) {
  const { data: raw, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, ch = info.channels;
  const 잉크 = new Uint8Array(W * H);
  for (let i = 0, p = 0; i < W * H; i++, p += ch) 잉크[i] = raw[p + 3] >= 16 ? 1 : 0;
  const 표 = new Int32Array(W * H).fill(-1); const 줄 = new Int32Array(W * H); const 크기: number[] = [];
  for (let s = 0; s < W * H; s++) {
    if (!잉크[s] || 표[s] >= 0) continue;
    const id = 크기.length; let 머리 = 0, 꼬리 = 0, n = 0;
    줄[꼬리++] = s; 표[s] = id;
    while (머리 < 꼬리) {
      const q = 줄[머리++], x = q % W, y = (q / W) | 0; n++;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const k = ny * W + nx;
        if (잉크[k] && 표[k] < 0) { 표[k] = id; 줄[꼬리++] = k; }
      }
    }
    크기.push(n);
  }
  크기.sort((a, b) => b - a);
  let 위 = 0; for (let x = 0; x < W; x++) if (잉크[x]) 위++;
  return { 덩어리수: 크기.length, 남은것: 크기.slice(1), 위 };
}

const 전 = await 살피기(원본);
console.log(`원본        덩어리 ${전.덩어리수}개 · 몸 말고 ${전.남은것.length}개 · 위 가장자리 ${전.위}점`);

/* ① 떨어진 조각 심기 — 왼쪽 위에 8×8 흰 네모 */
const 조각심음 = await sharp(원본).composite([{
  input: { create: { width: 8, height: 8, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }, left: 20, top: 20,
}]).png().toBuffer();
const a = await 살피기(조각심음);
console.log(`조각 심음    덩어리 ${a.덩어리수}개 · 몸 말고 ${a.남은것.length}개 → ${a.남은것.length > 전.남은것.length ? "✅ 잡았다" : "❌ 못 잡았다"}`);

/* ② 가장자리 잉크 심기 — 맨 윗줄에 가로줄 */
const 줄심음 = await sharp(원본).composite([{
  input: { create: { width: 60, height: 2, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }, left: 100, top: 0,
}]).png().toBuffer();
const b = await 살피기(줄심음);
console.log(`가장자리 심음 위 ${b.위}점 → ${b.위 > 전.위 ? "✅ 잡았다" : "❌ 못 잡았다"}`);
