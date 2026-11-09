import type { OverlayOptions } from "sharp";
/**
 * **자르기가 잘못된 칸 찾기** — 11-08 사장님: *"도트 자르기 잘 안 된 거 있어"*.
 *
 * 시트 한 장을 3×2 로 자를 때 금이 어긋나면 **옆 칸 조각이 따라 들어온다.** 눈으로 찾지 말고
 * 센다: 잉크 덩어리를 전부 찾아서 **제일 큰 덩어리(= 몸)** 말고 남는 것들, 그리고 **캔버스
 * 가장자리에 닿은 잉크**(= 잘린 자국)를 적는다.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
const { createClient } = await import("@supabase/supabase-js");
const sharp = (await import("sharp")).default;
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data } = await db.from("dot_characters").select("slug, name, sprites, is_public");
const 공개 = (data as any[]).filter((c) => c.is_public && c.sprites).sort((a, b) => a.slug.localeCompare(b.slug));

type 덩어리 = { 크기: number; x0: number; y0: number; x1: number; y1: number };

async function 살피기(png: Buffer) {
  const { data: raw, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, ch = info.channels;
  const 잉크 = new Uint8Array(W * H);
  for (let i = 0, p = 0; i < W * H; i++, p += ch) 잉크[i] = raw[p + 3] >= 16 ? 1 : 0;

  /* 4방향으로만 붙인다 — 8방향으로 세면 대각선으로 스친 티끌이 몸에 붙어 버려 자가 눈을 감는다(11-08). */
  const 표 = new Int32Array(W * H).fill(-1);
  const 덩어리들: 덩어리[] = [];
  const 줄 = new Int32Array(W * H);
  for (let s = 0; s < W * H; s++) {
    if (!잉크[s] || 표[s] >= 0) continue;
    const id = 덩어리들.length;
    let 머리 = 0, 꼬리 = 0;
    줄[꼬리++] = s; 표[s] = id;
    let n = 0, x0 = W, y0 = H, x1 = -1, y1 = -1;
    while (머리 < 꼬리) {
      const q = 줄[머리++]; const x = q % W, y = (q / W) | 0;
      n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]] as const) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const k = ny * W + nx;
        if (잉크[k] && 표[k] < 0) { 표[k] = id; 줄[꼬리++] = k; }
      }
    }
    덩어리들.push({ 크기: n, x0, y0, x1, y1 });
  }
  덩어리들.sort((a, b) => b.크기 - a.크기);

  /* 가장자리에 닿은 잉크 — 자르는 금이 몸을 지나갔다는 뜻 */
  let 위 = 0, 아래 = 0, 왼 = 0, 오른 = 0;
  for (let x = 0; x < W; x++) { if (잉크[x]) 위++; if (잉크[(H - 1) * W + x]) 아래++; }
  for (let y = 0; y < H; y++) { if (잉크[y * W]) 왼++; if (잉크[y * W + W - 1]) 오른++; }
  return { 덩어리들, 가장자리: { 위, 아래, 왼, 오른 }, W, H };
}

const 나갈곳 = "C:/Users/az518/Desktop/로키-도트/자르기-20261108";
mkdirSync(나갈곳, { recursive: true });
const 나쁜것: { 이름: string; 왜: string; png: Buffer }[] = [];

for (const c of 공개) {
  for (const [감정, url] of Object.entries(c.sprites as Record<string, string>)) {
    const r = await fetch(url); if (!r.ok) { console.log(`  ⚠ ${c.name} ${감정} ${r.status}`); continue; }
    const png = Buffer.from(await r.arrayBuffer());
    const m = await 살피기(png);
    const 몸 = m.덩어리들[0];
    const 남은것 = m.덩어리들.slice(1).filter((d) => d.크기 >= 1);   // 1점부터 전부 센다 — 자가 침묵했으니 문턱부터 의심한다
    const 남은점 = 남은것.reduce((s, d) => s + d.크기, 0);
    const 까닭: string[] = [];
    if (남은것.length) 까닭.push(`떨어진 조각 ${남은것.length}개(${남은점}점, 제일 큰 것 ${남은것[0].크기}점 @${남은것[0].x0},${남은것[0].y0})`);
    /* 아래(발)는 바닥에 닿는 게 정상이다. 위·옆에 닿으면 잘린 것이다. */
    if (m.가장자리.위 > 0) 까닭.push(`위쪽 가장자리에 잉크 ${m.가장자리.위}점`);
    if (m.가장자리.왼 > 0) 까닭.push(`왼쪽 ${m.가장자리.왼}점`);
    if (m.가장자리.오른 > 0) 까닭.push(`오른쪽 ${m.가장자리.오른}점`);
    if (까닭.length) {
      console.log(`✗ ${c.name} ${감정.padEnd(18)} 몸 ${몸.크기}점 · ${까닭.join(" · ")}`);
      나쁜것.push({ 이름: `${c.name} ${감정}`, 왜: 까닭.join(" · "), png });
    }
  }
}
console.log(`\n자르기가 어긋난 칸 ${나쁜것.length}개`);

if (나쁜것.length) {
  const 칸 = 240, 줄 = Math.min(6, 나쁜것.length), 행 = Math.ceil(나쁜것.length / 줄);
  const 조각: OverlayOptions[] = [];
  for (const [i, b] of 나쁜것.entries()) {
    조각.push({ input: await sharp(b.png).resize(칸, 칸).png().toBuffer(), left: (i % 줄) * 칸, top: Math.floor(i / 줄) * (칸 + 26) + 26 });
  }
  const svg = `<svg width="${줄 * 칸}" height="${행 * (칸 + 26) + 26}"><style>text{font-family:sans-serif;font-size:16px;fill:#fff}</style>` +
    나쁜것.map((b, i) => `<text x="${(i % 줄) * 칸 + 6}" y="${Math.floor(i / 줄) * (칸 + 26) + 18}">${b.이름}</text>`).join("") + `</svg>`;
  조각.push({ input: Buffer.from(svg), left: 0, top: 0 });
  const out = join(나갈곳, "_어긋난칸.png");
  await sharp({ create: { width: 줄 * 칸, height: 행 * (칸 + 26) + 26, channels: 4, background: { r: 24, g: 24, b: 32, alpha: 1 } } })
    .composite(조각).png().toFile(out);
  console.log(out);
  writeFileSync(join(나갈곳, "_목록.txt"), 나쁜것.map((b) => `${b.이름}: ${b.왜}`).join("\n"), "utf8");
}
