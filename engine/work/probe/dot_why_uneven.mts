/**
 * **왜 퀄리티가 다른가** — 추측 말고 장부로. 11-08.
 * 캐릭터별 스프라이트의 (1) 올린 날 (2) 색 수 (3) 잉크 폭·높이 (4) 파일 크기를 나란히 둔다.
 * 날이 갈리면 "판이 다르다"가 원인이고, 같은 날인데 색 수가 갈리면 "주문이 다르다"가 원인이다.
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
const { createClient } = await import("@supabase/supabase-js");
const sharp = (await import("sharp")).default;
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: 사람들 } = await db.from("dot_characters").select("slug, name, sprites, is_public");
const 공개 = (사람들 as any[]).filter((c) => c.is_public && c.sprites).sort((a, b) => a.slug.localeCompare(b.slug));

/** 통 안에 올라간 날 — 판이 갈리는지를 보는 가장 단단한 증거 */
const 올린날 = new Map<string, { 날: string; 바이트: number }>();
for (const c of 공개) {
  const { data: 목록 } = await db.storage.from("dot-sprites").list(c.slug, { limit: 100 });
  for (const o of 목록 ?? []) {
    올린날.set(`${c.slug}/${o.name}`, {
      날: String(o.created_at ?? o.updated_at ?? "?").slice(0, 16).replace("T", " "),
      바이트: (o.metadata as any)?.size ?? 0,
    });
  }
}

async function 재기(b: Buffer) {
  const { data: raw, info } = await sharp(b).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const 색 = new Set<string>();
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, 잉크 = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const p = (y * info.width + x) * info.channels;
    if (raw[p + 3] < 16) continue;
    잉크++; 색.add(`${raw[p]},${raw[p + 1]},${raw[p + 2]}`);
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { 색: 색.size, 폭: x1 - x0 + 1, 높: y1 - y0 + 1, 잉크, 팔레트: 색 };
}

console.log("이름    칸      올린 날            색 수  잉크 폭×높   KB");
const 사람색: Map<string, Set<string>> = new Map();
const 사람날: Map<string, Set<string>> = new Map();
for (const c of 공개) {
  const 칸들 = Object.entries(c.sprites as Record<string, string>);
  const 모은색 = new Set<string>(); const 모은날 = new Set<string>();
  for (const [감정, url] of 칸들) {
    const r = await fetch(url);
    if (!r.ok) { console.log(`${c.name.padEnd(6)} ${감정.padEnd(9)} ← ${r.status} 안 열림`); continue; }
    const b = Buffer.from(await r.arrayBuffer());
    const m = await 재기(b);
    const 메타 = 올린날.get(`${c.slug}/${감정}.png`);
    모은날.add((메타?.날 ?? "?").slice(0, 10));
    for (const q of m.팔레트) 모은색.add(q);
    console.log(`${c.name.padEnd(6)} ${감정.padEnd(9)} ${(메타?.날 ?? "?").padEnd(18)} ${String(m.색).padStart(4)}  ${String(m.폭).padStart(3)}×${String(m.높).padEnd(3)}  ${String(Math.round((메타?.바이트 ?? b.length) / 1024)).padStart(4)}`);
  }
  사람색.set(c.name, 모은색); 사람날.set(c.name, 모은날);
  console.log(`  └ ${c.name}: 쓰인 색 ${모은색.size}가지 · 올린 날 ${[...모은날].join(", ")}`);
}

/** 캐릭터끼리 팔레트를 얼마나 같이 쓰나 — 한 결이면 많이 겹친다 */
console.log("\n팔레트 겹침(겹친 색 / 두 사람이 쓴 색)  — 한 사람이 그렸으면 높다");
const 이름들 = [...사람색.keys()];
for (let i = 0; i < 이름들.length; i++) for (let j = i + 1; j < 이름들.length; j++) {
  const A = 사람색.get(이름들[i])!, B = 사람색.get(이름들[j])!;
  let 같음 = 0; for (const q of A) if (B.has(q)) 같음++;
  const 합 = new Set([...A, ...B]).size;
  console.log(`  ${이름들[i]} ↔ ${이름들[j]}  ${((같음 / 합) * 100).toFixed(0)}%  (${같음}/${합})`);
}
