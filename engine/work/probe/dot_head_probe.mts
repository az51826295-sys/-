/** 그림체가 두 갈래인가 — 머리가 어깨보다 넓은가로 가른다. 11-08. */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
const { createClient } = await import("@supabase/supabase-js");
const sharp = (await import("sharp")).default;
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data } = await db.from("dot_characters").select("slug, name, sprites, is_public");
const 사람 = (data as any[]).filter((c) => c.is_public && c.sprites).sort((a, b) => a.slug.localeCompare(b.slug));

console.log("이름     몸높이  제일넓은줄(위에서%)  머리폭/어깨폭");
for (const c of 사람) {
  const keys = Object.keys(c.sprites).filter((k) => !k.startsWith("face") && !k.includes(":") && !k.startsWith("sticker"));
  const 값: number[] = []; const 비: number[] = [];
  for (const k of keys) {
    const r = await fetch(c.sprites[k]); if (!r.ok) continue;
    const { data: raw, info } = await sharp(Buffer.from(await r.arrayBuffer())).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width: W, height: H, channels: C } = info;
    const 줄폭: number[] = [];
    let top = -1, bottom = -1;
    for (let y = 0; y < H; y++) {
      let l = -1, rr = -1;
      for (let x = 0; x < W; x++) if (raw[(y * W + x) * C + 3] > 16) { if (l < 0) l = x; rr = x; }
      줄폭.push(l < 0 ? 0 : rr - l + 1);
      if (l >= 0) { if (top < 0) top = y; bottom = y; }
    }
    const h = bottom - top + 1;
    const 몸 = 줄폭.slice(top, bottom + 1);
    const 제일넓은 = 몸.indexOf(Math.max(...몸));
    값.push((제일넓은 / h) * 100);
    /* 머리폭 = 위 35% 구간의 최대, 어깨폭 = 아래 35% 구간의 최대 */
    const a = Math.max(...몸.slice(0, Math.floor(h * 0.35)));
    const b = Math.max(...몸.slice(Math.floor(h * 0.65)));
    비.push(a / (b || 1));
  }
  const 평 = (x: number[]) => x.reduce((s, v) => s + v, 0) / (x.length || 1);
  console.log(`${c.name.padEnd(7)} ${keys.length}장   ${평(값).toFixed(0).padStart(4)}%              ${평(비).toFixed(2)}`);
}
