import type { OverlayOptions } from "sharp";
/**
 * # 흰 테두리 두르기  (11-08 사장님: *"오케이 하자, 흰색으로 대비를 주든지 해"*)
 *
 *   npx tsx engine/tools/dot_outline.mts                 ← 재기만 (구멍·맞닿은 배경칸)
 *   npx tsx engine/tools/dot_outline.mts --fix           ← 두르고 바탕화면에 쌓기
 *   npx tsx engine/tools/dot_outline.mts --fix --up      ← 통에 올리기까지 (사장님 말 있을 때만)
 *   --color 255,255,255   --width 1   --only rin,yuna
 *
 * ## 재료는 **통이 아니라 바탕화면**이다
 *
 * 통에는 아직 오늘 고친 것들이 안 올라갔다. 그래서 티끌 메운 60칸 + 유나 멘헤라 격자 고친
 * 6칸을 재료로 쓴다. 통에서 받아 두르면 오늘 고친 걸 되돌리게 된다.
 *
 * ## 자
 *
 * 1. **도트 크기가 밀리지 않았나** — 테두리는 칸 단위라 그대로여야 한다. 밀리면 안 올린다.
 * 2. **원래 잉크에 닿아 있던 빈 칸을 하나도 안 빼놨나** — 처음엔 "두른 뒤 닿은 칸 0"으로 쟀는데
 *    **그건 0 이 될 수가 없다**: 테두리를 칠하면 그 바로 바깥 줄이 새로 닿은 칸이 된다. 거짓 경보였다.
 *    그래서 **두르기 전 잉크 지도**를 들고 있다가, 그때 닿아 있던 빈 칸이 전부 칠해졌는지 센다.
 * 3. **실루엣이 얼마나 커졌나** — 테두리는 사방 한 칸을 먹으므로 폭이 2칸 늘어난다. 적어 둔다.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const 적힌것 = new Map<string, string>();
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) 적힌것.set(l.slice(0, i).trim(), l.slice(i + 1).trim());
}
const { createClient } = await import("@supabase/supabase-js");
const sharp = (await import("sharp")).default;
const { outlineSprite, countHoles } = await import("../../src/lib/dot/outline");
const { ALPHA_MIN } = await import("../../src/lib/dot/fringe");

const 끌 = (이름: string) => { const i = process.argv.indexOf(이름); return i > 0 ? process.argv[i + 1] : undefined; };
const 누구만 = (끌("--only") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const 색 = (끌("--color") ?? "255,255,255").split(",").map(Number) as [number, number, number];
const 두께 = Number(끌("--width") ?? 1);
const 고칠까 = process.argv.includes("--fix");
const 올릴까 = process.argv.includes("--up");

const 재료우선 = ["C:/Users/az518/Desktop/로키-도트/티끌-20261108", "C:/Users/az518/Desktop/로키-도트/격자고침-20261108"];
const 나갈곳 = "C:/Users/az518/Desktop/로키-도트/테두리-20261108";
mkdirSync(나갈곳, { recursive: true });

const db = createClient(적힌것.get("NEXT_PUBLIC_SUPABASE_URL")!, 적힌것.get("SUPABASE_SECRET_KEY")!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const 터 = join(process.env.TEMP ?? ".", `outline-${Date.now()}`);
mkdirSync(터, { recursive: true });

function 도트재기(paths: string[]): (number | null)[] {
  if (!paths.length) return [];
  const py = [
    "import sys, json",
    "sys.path.insert(0, 'engine/genesis')",
    "import texel_judge as T",
    `paths = ${JSON.stringify(paths)}`,
    "print(json.dumps([T.measure_one(p).get('texel') for p in paths]))",
  ].join("\n");
  return JSON.parse(execFileSync("python", ["-c", py], { encoding: "utf8", cwd: process.cwd() }).trim().split("\n").pop()!);
}

/** 잉크에 닿은 빈 칸이 몇 개인가 + 잉크가 차지한 네모 크기(칸). 두른 뒤엔 닿은 칸이 0 이어야 한다. */
async function 맞닿음(png: Buffer, texel: number) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, ch = info.channels;
  const 가로 = Math.floor(W / texel), 세로 = Math.floor(info.height / texel);
  const 잉크 = new Uint8Array(가로 * 세로);
  for (let gy = 0; gy < 세로; gy++) for (let gx = 0; gx < 가로; gx++) {
    const p = ((gy * texel + (texel >> 1)) * W + gx * texel + (texel >> 1)) * ch;
    잉크[gy * 가로 + gx] = data[p + 3] >= ALPHA_MIN ? 1 : 0;
  }
  let 닿은빈칸 = 0, x0 = 가로, x1 = -1, y0 = 세로, y1 = -1;
  for (let gy = 0; gy < 세로; gy++) for (let gx = 0; gx < 가로; gx++) {
    if (잉크[gy * 가로 + gx]) { if (gx < x0) x0 = gx; if (gx > x1) x1 = gx; if (gy < y0) y0 = gy; if (gy > y1) y1 = gy; continue; }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = gx + dx, ny = gy + dy;
      if (nx < 0 || ny < 0 || nx >= 가로 || ny >= 세로) continue;
      if (잉크[ny * 가로 + nx]) { 닿은빈칸++; break; }
    }
  }
  return { 닿은빈칸, 폭: x1 - x0 + 1, 높이: y1 - y0 + 1 };
}

/** 칸 단위 잉크 지도. */
async function 잉크지도(png: Buffer, texel: number) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, ch = info.channels;
  const 가로 = Math.floor(W / texel), 세로 = Math.floor(info.height / texel);
  const m = new Uint8Array(가로 * 세로);
  for (let gy = 0; gy < 세로; gy++) for (let gx = 0; gx < 가로; gx++) {
    const p = ((gy * texel + (texel >> 1)) * W + gx * texel + (texel >> 1)) * ch;
    m[gy * 가로 + gx] = data[p + 3] >= ALPHA_MIN ? 1 : 0;
  }
  return { m, 가로, 세로 };
}

/**
 * **두르기 전** 잉크에 닿아 있던 빈 칸 중, 두른 뒤에도 비어 있는 칸 수. 0 이어야 한다.
 * (두른 뒤 "닿은 칸"을 그냥 세면 새 테두리의 바깥 줄이 걸려서 절대 0 이 안 된다 — 첫 자가 그 함정에 빠졌다.)
 */
async function 덜칠한칸(원본: Buffer, 두른것: Buffer, texel: number) {
  const a = await 잉크지도(원본, texel), b = await 잉크지도(두른것, texel);
  let 덜 = 0;
  for (let gy = 0; gy < a.세로; gy++) for (let gx = 0; gx < a.가로; gx++) {
    if (a.m[gy * a.가로 + gx]) continue;
    let 닿음 = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = gx + dx, ny = gy + dy;
      if (nx < 0 || ny < 0 || nx >= a.가로 || ny >= a.세로) continue;
      if (a.m[ny * a.가로 + nx]) { 닿음 = true; break; }
    }
    if (닿음 && !b.m[gy * b.가로 + gx]) 덜++;
  }
  return 덜;
}

/* ── 어떤 칸들이 있나: 통의 목록을 쓰되 **그림은 바탕화면에서** 집는다 ── */
const { data, error } = await db.from("dot_characters").select("slug, name, sprites, is_public");
if (error) { console.error(`표를 못 읽었다: ${error.message}`); process.exit(1); }
const 공개 = (data as any[]).filter((c) => c.is_public && c.sprites).sort((a, b) => a.slug.localeCompare(b.slug));

type 칸 = { slug: string; 이름: string; 감정: string; 파일: string; png: Buffer; 길: string; texel: number | null; 어디: string };
const 칸들: 칸[] = [];
const 빠진것: string[] = [];
for (const c of 공개) {
  if (누구만.length && !누구만.includes(c.slug)) continue;
  for (const 감정 of Object.keys(c.sprites as Record<string, string>)) {
    const 파일 = `${감정.replace(":", "-")}.png`;
    const 찾음 = 재료우선.map((밑) => join(밑, c.slug, 파일)).find((p) => existsSync(p));
    if (!찾음) { 빠진것.push(`${c.name} ${감정}`); continue; }
    const png = readFileSync(찾음);
    const 길 = join(터, `${c.slug}__${파일}`).split("\\").join("/");
    writeFileSync(길, png);
    칸들.push({ slug: c.slug, 이름: c.name, 감정, 파일, png, 길, texel: null, 어디: 찾음.includes("티끌") ? "티끌" : "격자" });
  }
}
if (빠진것.length) console.log(`바탕화면에 없는 칸 ${빠진것.length}개 — 건너뜀: ${빠진것.join(", ")}\n`);
const 도트 = 도트재기(칸들.map((x) => x.길));
칸들.forEach((x, i) => (x.texel = 도트[i]));

/* ── 심은 고장: 다 두른 그림에서 테두리 칸 다섯을 뚫는다. 자가 정확히 5 를 내야 한다. ── */
if (process.argv.includes("--sabotage")) {
  const x = 칸들.find((k) => k.texel) ?? 칸들[0];
  const t = x.texel!;
  const 둘렀다 = (await outlineSprite(x.png, t, { 식: "한색", 색 }, 두께)).png;
  console.log(`심은 고장 — ${x.이름} ${x.감정} (도트 ${t})`);
  console.log(`  멀쩡할 때 덜칠함 ${await 덜칠한칸(x.png, 둘렀다, t)} (0 이어야 한다)`);
  const 전지도 = await 잉크지도(x.png, t);
  const { data, info } = await sharp(둘렀다).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const buf = Buffer.from(data); const W = info.width, ch = info.channels;
  let 뚫은수 = 0;
  for (let gy = 1; gy < 전지도.세로 - 1 && 뚫은수 < 5; gy++) for (let gx = 1; gx < 전지도.가로 - 1 && 뚫은수 < 5; gx++) {
    if (전지도.m[gy * 전지도.가로 + gx]) continue;
    const 닿음 = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).some(([dx, dy]) => 전지도.m[(gy + dy) * 전지도.가로 + gx + dx]);
    if (!닿음) continue;
    for (let y = gy * t; y < (gy + 1) * t; y++) for (let xx = gx * t; xx < (gx + 1) * t; xx++) {
      const p = (y * W + xx) * ch; buf[p + 3] = 0;
    }
    뚫은수++; gy += 2;
  }
  const 망친것 = await sharp(buf, { raw: { width: W, height: info.height, channels: ch } }).png().toBuffer();
  const 잡은수 = await 덜칠한칸(x.png, 망친것, t);
  console.log(`  테두리 ${뚫은수}칸 뚫음 → 덜칠함 ${잡은수}`);
  console.log(잡은수 === 뚫은수 ? `  ✅ 자가 잡는다` : `  ❌ 자가 못 잡는다 — 이 자는 못 쓴다`);
  process.exit(잡은수 === 뚫은수 ? 0 : 1);
}

console.log(`흰 테두리 — 색 ${색.join(",")} · 두께 ${두께}칸\n이름   칸                재료  도트  구멍  둘러야할칸  칠함  덜칠함  폭(칸)`);
const 결과: { x: 칸; png: Buffer; 칠한칸: number; 남은: number; 폭전: number; 폭후: number }[] = [];
for (const x of 칸들) {
  if (!x.texel) { console.log(`${x.이름.padEnd(5)} ${x.감정.padEnd(18)} 격자를 못 재서 못 잼`); continue; }
  const h = await countHoles(x.png, x.texel);
  const 전 = await 맞닿음(x.png, x.texel);
  const r = await outlineSprite(x.png, x.texel, { 식: "한색", 색 }, 두께);
  const 후 = await 맞닿음(r.png, x.texel);
  const 덜 = await 덜칠한칸(x.png, r.png, x.texel);
  결과.push({ x, png: r.png, 칠한칸: r.칠한칸, 남은: 덜, 폭전: 전.폭, 폭후: 후.폭 });
  console.log(
    `${x.이름.padEnd(5)} ${x.감정.padEnd(18)} ${x.어디}  ${String(x.texel).padStart(3)} ${String(h.구멍).padStart(5)} ` +
    `${String(전.닿은빈칸).padStart(10)} ${String(r.칠한칸).padStart(5)} ${String(덜).padStart(6)}  ${전.폭}→${후.폭}`,
  );
}
const 안덮인것 = 결과.filter((r) => r.남은 > 0);
console.log(안덮인것.length
  ? `\n틀림  원래 잉크에 닿아 있던 빈 칸을 빼놓은 칸 ${안덮인것.length}개 — 테두리에 구멍이 난다`
  : `\n맞음  ${결과.length}칸 전부 덜 칠한 데 0 — 빈틈 없이 둘렀다`);
console.log(`      칠한 칸 합계 ${결과.reduce((s, r) => s + r.칠한칸, 0)}개 · 실루엣 폭 평균 +${(결과.reduce((s, r) => s + (r.폭후 - r.폭전), 0) / Math.max(1, 결과.length)).toFixed(1)}칸`);

if (!고칠까) { console.log(`\n재기만 했다. 두르려면 --fix`); process.exit(0); }

for (const { x, png } of 결과) {
  const d = join(나갈곳, x.slug); mkdirSync(d, { recursive: true });
  writeFileSync(join(d, x.파일), png);
}
/* 도트 크기가 밀렸나 */
const 후길 = 결과.map(({ png }, i) => { const p = join(터, `out-${i}.png`).split("\\").join("/"); writeFileSync(p, png); return p; });
const 후도트 = 도트재기(후길);
const 밀림 = 결과.map(({ x }, i) => (x.texel !== 후도트[i] ? `${x.이름} ${x.감정}: ${x.texel}→${후도트[i]}` : "")).filter(Boolean);
console.log(밀림.length ? `틀림  도트가 밀린 칸:\n  ${밀림.join("\n  ")}` : `맞음  도트 크기는 ${결과.length}칸 전부 그대로`);

/* 밝은 방·어두운 방 두 바탕 위에 전/후 — 흰 테두리는 바탕에 따라 다르게 읽힌다 */
const 볼것 = ["rin", "yuna", "nabi"].flatMap((s) => 결과.filter((r) => r.x.slug === s && r.x.감정 === "neutral"));
if (볼것.length) {
  const 크기 = 360, 머리 = 26;
  const 바탕들: [string, { r: number; g: number; b: number }][] = [["밝은 방", { r: 246, g: 237, b: 226 }], ["어두운 방", { r: 38, g: 34, b: 48 }]];
  const 조각: OverlayOptions[] = [];
  let 글 = "";
  for (const [bi, [바탕이름, c]] of 바탕들.entries()) {
    const 바탕 = await sharp({ create: { width: 크기, height: 크기, channels: 4, background: { ...c, alpha: 1 } } }).png().toBuffer();
    for (const [i, r] of 볼것.entries()) {
      for (const [j, png] of [r.x.png, r.png].entries()) {
        const 위 = 머리 + (bi * 2 + j) * (크기 + 머리);
        조각.push({
          input: await sharp(바탕).composite([{ input: await sharp(png).resize(크기, 크기, { kernel: "nearest" }).png().toBuffer() }]).png().toBuffer(),
          left: i * 크기, top: 위,
        });
        if (i === 0) 글 += `<text x="6" y="${위 - 7}">${바탕이름} — ${j === 0 ? "지금" : `흰 테두리 ${두께}칸`}</text>`;
      }
    }
  }
  const W = 크기 * 볼것.length, H = 머리 + 4 * (크기 + 머리);
  조각.push({ input: Buffer.from(`<svg width="${W}" height="${H}"><style>text{font-family:sans-serif;font-size:18px;fill:#fff}</style>${글}</svg>`), left: 0, top: 0 });
  const out = join(나갈곳, "_테두리전후.png");
  await sharp({ create: { width: W, height: H, channels: 4, background: { r: 20, g: 20, b: 26, alpha: 1 } } }).composite(조각).png().toFile(out);
  console.log(out);
}

if (!올릴까) { console.log(`\n올리지 않았다. 통에 넣으려면 --up (원본은 통에 그대로 있다).`); }
else if (밀림.length || 안덮인것.length) { console.log(`\n자가 틀렸다고 해서 올리지 않는다.`); }
else {
  for (const { x, png } of 결과) {
    const { error: e } = await db.storage.from("dot-sprites").upload(`${x.slug}/${x.파일}`, png, { contentType: "image/png", upsert: true });
    console.log(`  ${e ? `✗ ${x.slug}/${x.파일} ${e.message}` : `✓ ${x.slug}/${x.파일}`}`);
  }
}
