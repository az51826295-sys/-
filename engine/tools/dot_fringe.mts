/**
 * # 테두리 티끌 재고 지우기  (11-08 사장님: *"린 유나 잘 안잘림"*)
 *
 *   npx tsx engine/tools/dot_fringe.mts                 ← 66칸 재기만
 *   npx tsx engine/tools/dot_fringe.mts --sabotage      ← 심은 고장을 잡나
 *   npx tsx engine/tools/dot_fringe.mts --fix           ← 지워서 바탕화면에 쌓기
 *   npx tsx engine/tools/dot_fringe.mts --fix --up      ← 통에 올리기까지 (사장님 말 있을 때만)
 *
 * 자는 `src/lib/dot/fringe.ts`. 떨어진 조각이 아니라 **머리에 붙어 있는 배경 잔재**를 센다.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const 적힌것 = new Map<string, string>();
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) 적힌것.set(l.slice(0, i).trim(), l.slice(i + 1).trim());
}
for (const [k, v] of 적힌것) process.env[k] ||= v;

const { createClient } = await import("@supabase/supabase-js");
const sharp = (await import("sharp")).default;
const { measureFringe, removeFringe, fillFringe, DELTA_E, ISLAND_MAX, DEPTH_MAX } = await import("../../src/lib/dot/fringe");

const 끌 = (이름: string) => {
  const i = process.argv.indexOf(이름);
  return i > 0 ? process.argv[i + 1] : undefined;
};
/** 사람 몇만 — `--only rin,yuna`. 머리 결이 저마다 달라서 섬 크기를 사람별로 달리 줄 수 있다. */
const 누구만 = (끌("--only") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
/** 섬 크기 한도를 덮어쓴다 — 올릴 때마다 `_지운자리.png` 로 확인할 것. */
const 섬크기 = 끌("--island") ? Number(끌("--island")) : undefined;
/** 실루엣에서 몇 칸 안쪽까지 볼지 — `--depth`. */
const 깊이 = 끌("--depth") ? Number(끌("--depth")) : undefined;
const 고칠까 = process.argv.includes("--fix");
/** 지우지 말고 **옆 색으로 메운다** — 티끌은 배경이 남은 자리라 지우면 구멍이 된다. */
const 메울까 = process.argv.includes("--fill");
const 올릴까 = process.argv.includes("--up");
const 심기 = process.argv.includes("--sabotage");
const 나갈곳 = "C:/Users/az518/Desktop/로키-도트/티끌-20261108";
mkdirSync(나갈곳, { recursive: true });

const db = createClient(적힌것.get("NEXT_PUBLIC_SUPABASE_URL")!, 적힌것.get("SUPABASE_SECRET_KEY")!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const 터 = join(process.env.TEMP ?? ".", `fringe-${Date.now()}`);
mkdirSync(터, { recursive: true });

function 도트재기(paths: string[]): (number | null)[] {
  const py = [
    "import sys, json",
    "sys.path.insert(0, 'engine/genesis')",
    "import texel_judge as T",
    `paths = ${JSON.stringify(paths)}`,
    "print(json.dumps([T.measure_one(p).get('texel') for p in paths]))",
  ].join("\n");
  return JSON.parse(execFileSync("python", ["-c", py], { encoding: "utf8", cwd: process.cwd() }).trim().split("\n").pop()!);
}

const { data, error } = await db.from("dot_characters").select("slug, name, sprites, is_public");
if (error) { console.error(`표를 못 읽었다: ${error.message}`); process.exit(1); }
const 공개 = (data as any[]).filter((c) => c.is_public && c.sprites).sort((a, b) => a.slug.localeCompare(b.slug));

type 칸 = { slug: string; 이름: string; 감정: string; png: Buffer; 길: string; texel: number | null };
const 칸들: 칸[] = [];
for (const c of 공개) {
  if (누구만.length && !누구만.includes(c.slug)) continue;
  for (const [감정, url] of Object.entries(c.sprites as Record<string, string>)) {
  const r = await fetch(url); if (!r.ok) { console.log(`  ⚠ ${c.name} ${감정} ${r.status}`); continue; }
  const png = Buffer.from(await r.arrayBuffer());
  const 길 = join(터, `${c.slug}__${감정.replace(":", "-")}.png`).split("\\").join("/");
  writeFileSync(길, png);
  칸들.push({ slug: c.slug, 이름: c.name, 감정, png, 길, texel: null });
  }
}
const 도트 = 도트재기(칸들.map((x) => x.길));
칸들.forEach((x, i) => (x.texel = 도트[i]));

/* ── 심은 고장: 실루엣 테두리에 밝은 네모를 붙인다. 붙여 놨으니 덩어리는 그대로다 — 앞 자는 못 보고 이 자는 봐야 한다. ── */
if (심기) {
  const x = 칸들.find((k) => k.slug === "doyun" && k.감정 === "neutral") ?? 칸들[0];
  const t = x.texel ?? 8;
  const 전 = await measureFringe(x.png, t);
  const { data: raw, info } = await sharp(x.png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const buf = Buffer.from(raw); const W = info.width, ch = info.channels;
  /* 몸에 닿은 자리를 찾아 그 **바로 옆 배경 칸**을 밝은 회색으로 칠한다 = 덜 떨어진 배경 */
  let 심은수 = 0;
  for (let gy = 1; gy < Math.floor(info.height / t) - 1 && 심은수 < 12; gy++) {
    for (let gx = 1; gx < Math.floor(W / t) - 1 && 심은수 < 12; gx++) {
      const 나 = ((gy * t + (t >> 1)) * W + gx * t + (t >> 1)) * ch;
      const 옆 = ((gy * t + (t >> 1)) * W + (gx + 1) * t + (t >> 1)) * ch;
      if (raw[나 + 3] < 16 && raw[옆 + 3] >= 16) {
        for (let y = gy * t; y < (gy + 1) * t; y++) for (let xx = gx * t; xx < (gx + 1) * t; xx++) {
          const p = (y * W + xx) * ch;
          buf[p] = 230; buf[p + 1] = 230; buf[p + 2] = 235; buf[p + 3] = 255;
        }
        심은수++; gy += 3;
      }
    }
  }
  const 망친것 = await sharp(buf, { raw: { width: W, height: info.height, channels: ch } }).png().toBuffer();
  const 후 = await measureFringe(망친것, t);
  console.log(`심은 고장 — ${x.이름} ${x.감정} 테두리에 밝은 칸 ${심은수}개 붙임 (덩어리는 그대로다)`);
  console.log(`  티끌 ${전.티끌} → ${후.티끌}`);
  console.log(후.티끌 >= 전.티끌 + 심은수 * 0.7 ? `  ✅ 자가 잡는다` : `  ❌ 자가 못 잡는다 — 이 자는 못 쓴다`);
  writeFileSync(join(나갈곳, "_심은고장.png"), 망친것);
  process.exit(후.티끌 >= 전.티끌 + 심은수 * 0.7 ? 0 : 1);
}

console.log(`테두리 티끌 (ΔE>${DELTA_E} · 바깥 기준 CIE76)\n이름   칸                테두리  티끌   비율`);
const 사람합 = new Map<string, { 테: number; 티: number }>();
const 고친것: { x: 칸; png: Buffer; 지움: number }[] = [];
for (const x of 칸들) {
  if (!x.texel) { console.log(`${x.이름.padEnd(5)} ${x.감정.padEnd(18)} 격자를 못 재서 못 잼`); continue; }
  const m = await measureFringe(x.png, x.texel, 섬크기 ?? ISLAND_MAX, 깊이 ?? DEPTH_MAX);
  const s = 사람합.get(x.이름) ?? { 테: 0, 티: 0 };
  s.테 += m.테두리; s.티 += m.티끌; 사람합.set(x.이름, s);
  console.log(`${x.이름.padEnd(5)} ${x.감정.padEnd(18)} ${String(m.테두리).padStart(5)} ${String(m.티끌).padStart(6)} ${(m.비율 * 100).toFixed(1).padStart(6)}%`);
  if (고칠까) {
    const r = 메울까
      ? await fillFringe(x.png, x.texel, 섬크기 ?? ISLAND_MAX, 깊이 ?? DEPTH_MAX).then((v) => ({ png: v.png, 지움: v.메움 + v.지움 }))
      : await removeFringe(x.png, x.texel, 1, 섬크기 ?? ISLAND_MAX, 깊이 ?? DEPTH_MAX);
    고친것.push({ x, png: r.png, 지움: r.지움 });
  }
}
console.log(`\n사람별`);
for (const [이름, s] of [...사람합].sort((a, b) => b[1].티 / b[1].테 - a[1].티 / a[1].테)) {
  console.log(`  ${이름.padEnd(5)} 티끌 ${String(s.티).padStart(4)} / 테두리 ${String(s.테).padStart(5)}  ${((s.티 / s.테) * 100).toFixed(1)}%`);
}

if (!고칠까) { console.log(`\n재기만 했다. 지우려면 --fix`); process.exit(0); }

for (const { x, png } of 고친것) {
  const d = join(나갈곳, x.slug); mkdirSync(d, { recursive: true });
  writeFileSync(join(d, `${x.감정.replace(":", "-")}.png`), png);
}
/* 격자가 밀리지 않았는지 — 지우기는 칸 단위라 도트 크기가 그대로여야 한다 */
const 후길 = 고친것.map(({ x, png }, i) => {
  const p = join(터, `fixed-${i}.png`).split("\\").join("/"); writeFileSync(p, png); return p;
});
const 후도트 = 도트재기(후길);
const 밀림 = 고친것.map(({ x }, i) => (x.texel !== 후도트[i] ? `${x.이름} ${x.감정}: ${x.texel}→${후도트[i]}` : "")).filter(Boolean);
console.log(밀림.length ? `\n틀림  격자가 밀린 칸:\n  ${밀림.join("\n  ")}` : `\n맞음  격자는 ${고친것.length}칸 전부 그대로 · 지운 칸 합계 ${고친것.reduce((s, r) => s + r.지움, 0)}개`);

/* 전/후 사진 — 사장님이 집은 둘만 크게 */
const 볼것 = ["rin", "yuna"].flatMap((s) => 고친것.filter((r) => r.x.slug === s && r.x.감정 === "neutral"));
if (볼것.length) {
  const 칸크기 = 420;
  const 조각: sharp.OverlayOptions[] = [];
  for (const [i, r] of 볼것.entries()) {
    조각.push({ input: await sharp(r.x.png).resize(칸크기, 칸크기, { kernel: "nearest" }).png().toBuffer(), left: i * 칸크기, top: 28 });
    조각.push({ input: await sharp(r.png).resize(칸크기, 칸크기, { kernel: "nearest" }).png().toBuffer(), left: i * 칸크기, top: 28 + 칸크기 + 26 });
  }
  const svg = `<svg width="${칸크기 * 볼것.length}" height="${28 + 칸크기 * 2 + 26}"><style>text{font-family:sans-serif;font-size:18px;fill:#fff}</style>` +
    `<text x="6" y="20">전 — 지금 통에 있는 것</text><text x="6" y="${28 + 칸크기 + 19}">후 — 티끌 지움 (${볼것.map((r) => `${r.x.이름} ${r.지움}칸`).join(" · ")})</text></svg>`;
  조각.push({ input: Buffer.from(svg), left: 0, top: 0 });
  const out = join(나갈곳, "_전후.png");
  await sharp({ create: { width: 칸크기 * 볼것.length, height: 28 + 칸크기 * 2 + 26, channels: 4, background: { r: 70, g: 70, b: 82, alpha: 1 } } })
    .composite(조각).png().toFile(out);
  console.log(out);
}

if (!올릴까) { console.log(`\n올리지 않았다. 통에 넣으려면 --up (원본은 통에 그대로 있다).`); }
else if (밀림.length) { console.log(`\n격자가 밀린 칸이 있어 올리지 않는다.`); }
else {
  for (const { x, png } of 고친것) {
    const 길 = `${x.slug}/${x.감정.replace(":", "-")}.png`;
    const { error: e } = await db.storage.from("dot-sprites").upload(길, png, { contentType: "image/png", upsert: true });
    console.log(`  ${e ? `✗ ${길} ${e.message}` : `✓ ${길}`}`);
  }
}
