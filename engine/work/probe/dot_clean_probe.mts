/** 어느 장이 제일 깨끗한가 — 기준 한 장을 고르려고. 11-08.
 *  색 수(팔레트가 좁을수록 도트답다) · 외딴 조각(떠 있는 점 = 지저분함) · 반투명 칸(도트는 0 이어야) */
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

const T = 8; /* 도트 한 칸 */
console.log("이름     색 수   외딴조각   반투명칸   머리높이/몸높이");
for (const c of 사람) {
  const keys = Object.keys(c.sprites).filter((k) => !k.startsWith("face") && !k.includes(":") && !k.startsWith("sticker"));
  const 색수: number[] = [], 섬: number[] = [], 반투명: number[] = [], 머리비: number[] = [];
  for (const k of keys) {
    const r = await fetch(c.sprites[k]); if (!r.ok) continue;
    const { data: raw, info } = await sharp(Buffer.from(await r.arrayBuffer())).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width: W, height: H, channels: C } = info;
    /* 진짜 해상도(64x64)로 줄여 본다 — 8배 늘린 칸 하나가 한 점이다 */
    const w = Math.floor(W / T), h = Math.floor(H / T);
    const 점: (string | null)[] = []; let 반 = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = ((y * T + 4) * W + (x * T + 4)) * C;
      const a = raw[i + 3];
      if (a > 16 && a < 240) 반++;
      점.push(a > 16 ? `${raw[i]},${raw[i + 1]},${raw[i + 2]}` : null);
    }
    색수.push(new Set(점.filter(Boolean)).size);
    반투명.push(반);
    /* 외딴 조각: 네 이웃이 모두 빈 칸인 점 */
    let 외 = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!점[y * w + x]) continue;
      const 이웃 = [[0,-1],[0,1],[-1,0],[1,0]].filter(([dx,dy]) => {
        const nx = x + dx, ny = y + dy; return nx >= 0 && ny >= 0 && nx < w && ny < h && 점[ny * w + nx];
      }).length;
      if (이웃 === 0) 외++;
    }
    섬.push(외);
    /* 머리 높이: 위에서부터 가로폭이 최대폭의 절반 아래로 떨어지는 첫 지점(= 목) */
    const 줄폭: number[] = [];
    for (let y = 0; y < h; y++) { let n = 0; for (let x = 0; x < w; x++) if (점[y * w + x]) n++; 줄폭.push(n); }
    const top = 줄폭.findIndex((n) => n > 0), bottom = 줄폭.length - 1 - [...줄폭].reverse().findIndex((n) => n > 0);
    const 최대 = Math.max(...줄폭);
    let 목 = -1;
    for (let y = top + 3; y <= bottom; y++) if (줄폭[y] < 최대 * 0.45) { 목 = y; break; }
    머리비.push(목 > 0 ? (목 - top) / (bottom - top + 1) : NaN);
  }
  const 평 = (x: number[]) => { const v = x.filter((n) => !Number.isNaN(n)); return v.reduce((s, n) => s + n, 0) / (v.length || 1); };
  console.log(`${c.name.padEnd(7)} ${평(색수).toFixed(0).padStart(4)}   ${평(섬).toFixed(1).padStart(6)}   ${평(반투명).toFixed(0).padStart(6)}      ${평(머리비).toFixed(2)}`);
}
