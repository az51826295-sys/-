import type { OverlayOptions } from "sharp";
/**
 * # 일곱을 한 색표로 묶는다  (11-08 사장님: *"지금 다해"*)
 *
 *   npx tsx engine/tools/dot_palette_unify.mts              ← 재고 만들어서 바탕화면에 쌓기만
 *   npx tsx engine/tools/dot_palette_unify.mts --colors 48   ← 색 수 바꿔 보기
 *   npx tsx engine/tools/dot_palette_unify.mts --up          ← 통에 올리기까지 (사장님 말 있을 때만)
 *
 * ## ② 는 **틀린 진단이었다** — 색표 묶기는 기본으로 안 한다 (`--palette` 로만)
 *
 * 내가 "21쌍 전부 색 겹침 0% 라서 제각각으로 보인다"고 적었다. 그런데 **대조군**을 돌려 보니
 * (`engine/work/probe/dot_palette_control.mts`) 사장님이 *한 결*이라고 한 **피드도 겹침 0.0%** 였다.
 * 한 결인 쪽과 제각각인 쪽의 숫자가 같으면 그 숫자는 원인이 아니다 — **이빨 없는 자**였다.
 *
 * 실제로 묶어 보니 눈으로도 틀렸다: 피드에서 뽑힌 16색이 거의 살구·갈색이라, 나비의 분홍·민트가
 * 흰색이 되고 유나의 빨간 리본이 갈색이 됐다. **캐릭터 색이 사라진다.** 그래서 기본에서 뺀다.
 *
 * ## 그래서 기본으로 하는 일 — ③ 만
 *
 * ③ **유나 멘헤라 6칸은 격자가 깨져 있다**(도트 못 잼·순도 0.27~0.32) → 격자 256 으로 다시 깎는다.
 *
 * ① **밀도**(격자 64 = 4,096점)는 **여기서 못 고친다.** 이미 버려진 정보는 되돌아오지 않는다.
 *    `pixelize` 기본값을 256 으로 올려 뒀으니 **새로 그리는 것부터** 적용된다. 정직하게 적는다.
 *
 * ## 자와 대조군
 *
 * 묶었다고 말하려면 숫자가 움직여야 한다. 그래서 **21쌍 겹침**을 전/후로 재고,
 * **대조군**으로 "안 맞춘 원본 ↔ 맞춘 그림" 쌍도 같이 잰다. 대조군이 같이 올라가면
 * 자가 거짓으로 높은 값을 주는 것이므로 그 판은 못 믿는다.
 *
 * 그리고 색만 갈아탔으니 **도트 크기·순도는 안 바뀌어야 한다**(③ 칸만 예외). 바뀌면 멈춘다.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

/* ── .env.local 을 그대로 쓴다. rookery_env 를 거치면 죽은 프로젝트를 가리킨다(11-08). ── */
const 적힌것 = new Map<string, string>();
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("=");
  if (i > 0 && !l.startsWith("#")) 적힌것.set(l.slice(0, i).trim(), l.slice(i + 1).trim());
}
for (const [k, v] of 적힌것) process.env[k] ||= v;

const { createClient } = await import("@supabase/supabase-js");
const sharp = (await import("sharp")).default;
const { extractPalette, applyPalette, usedColors, paletteOverlap, paletteStrip, PALETTE_SIZE } =
  await import("../../src/lib/dot/palette");
const { pixelize } = await import("../../src/lib/dot/sprites");

const 끌 = (이름: string) => {
  const i = process.argv.indexOf(이름);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const 색수 = Number(끌("--colors") ?? PALETTE_SIZE);
/** 대조군이 뒤집은 기능이라 끄고 둔다 — 보고 싶으면 `--palette`. */
const 색묶기 = process.argv.includes("--palette");
const 올릴까 = process.argv.includes("--up");
const 나갈곳 = 끌("--out") ?? `C:/Users/az518/Desktop/로키-도트/색표-20261108`;
mkdirSync(나갈곳, { recursive: true });

const db = createClient(적힌것.get("NEXT_PUBLIC_SUPABASE_URL")!, 적힌것.get("SUPABASE_SECRET_KEY")!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const 시작 = Date.now();
const 째 = () => `${((Date.now() - 시작) / 1000).toFixed(0)}초`;

const { data: 사람들, error } = await db.from("dot_characters").select("slug, name, sprites, photos, is_public");
if (error) { console.error(`표를 못 읽었다: ${error.message}`); process.exit(1); }
const 공개 = (사람들 as any[]).filter((c) => c.is_public && c.sprites).sort((a, b) => a.slug.localeCompare(b.slug));
console.log(`사람 ${공개.length}명 · 색표 ${색수}색 · ${나갈곳}\n`);

/* ── 1. 피드에서 색표를 뽑는다 ── */
const 피드: Buffer[] = [];
for (const c of 공개) {
  const ps: any[] = Array.isArray(c.photos) ? c.photos : c.photos ? Object.values(c.photos) : [];
  for (const u of ps.map((p: any) => (typeof p === "string" ? p : p?.url)).filter(Boolean)) {
    const r = await fetch(u);
    if (r.ok) 피드.push(Buffer.from(await r.arrayBuffer()));
  }
}
if (피드.length < 3) { console.error(`피드 그림이 ${피드.length}장뿐이다 — 색표를 뽑을 재료가 모자라다`); process.exit(1); }
const 색표 = await extractPalette(피드, 색수);
writeFileSync(join(나갈곳, `_색표-${색표.length}색.png`), await paletteStrip(색표));
console.log(`피드 ${피드.length}장에서 색표 ${색표.length}색을 뽑았다 → _색표-${색표.length}색.png  (${째()})`);

/* ── 2. 모든 칸을 받아서 색을 갈아탄다 ── */
type 칸 = { slug: string; 이름: string; 감정: string; 전: Buffer; 후: Buffer; 격자고침: boolean };
const 칸들: 칸[] = [];
for (const c of 공개) {
  for (const [감정, url] of Object.entries(c.sprites as Record<string, string>)) {
    const r = await fetch(url);
    if (!r.ok) { console.log(`  ⚠ ${c.name} ${감정} 안 열림 (${r.status}) — 건너뛴다`); continue; }
    const 전 = Buffer.from(await r.arrayBuffer());
    칸들.push({ slug: c.slug, 이름: c.name, 감정, 전, 후: 전, 격자고침: false });
  }
}
console.log(`칸 ${칸들.length}개를 받았다  (${째()})`);

/* 격자가 깨진 칸을 먼저 찾아낸다 — 추측 말고 도트 자로. */
function 도트재기(paths: string[]) {
  const py = [
    "import sys, json",
    "sys.path.insert(0, 'engine/genesis')",
    "import texel_judge as T",
    `paths = ${JSON.stringify(paths)}`,
    "out = [T.measure_one(p) for p in paths]",
    "print(json.dumps([{ 't': o.get('texel'), 'p': o.get('purity') } for o in out]))",
  ].join("\n");
  return JSON.parse(execFileSync("python", ["-c", py], { encoding: "utf8", cwd: process.cwd() }).trim().split("\n").pop()!) as
    { t: number | null; p: number | null }[];
}
const 터 = join(process.env.TEMP ?? ".", `palunify-${Date.now()}`);
mkdirSync(터, { recursive: true });
const 전길 = 칸들.map((x, i) => {
  const p = join(터, `before-${i}.png`);
  writeFileSync(p, x.전);
  return p.split("\\").join("/");
});
const 전도트 = 도트재기(전길);
const 깨진칸 = 칸들.map((x, i) => (전도트[i].t === null || (전도트[i].p ?? 1) < 0.9 ? i : -1)).filter((i) => i >= 0);
console.log(`격자가 깨진 칸 ${깨진칸.length}개: ${깨진칸.map((i) => `${칸들[i].이름} ${칸들[i].감정}`).join(", ") || "없음"}`);

for (const [i, x] of 칸들.entries()) {
  let 그림 = x.전;
  if (깨진칸.includes(i)) { 그림 = await pixelize(그림); x.격자고침 = true; }   // 격자 256 — 새 기본값
  x.후 = 색묶기 ? await applyPalette(그림, 색표) : 그림;
}
console.log(색묶기 ? `색 갈아타기 끝  (${째()})` : `격자만 고쳤다 — 색은 안 건드렸다(대조군이 뒤집은 진단)  (${째()})`);

/* ── 3. 자: 21쌍 겹침 전/후 + 대조군 + 도트 크기 ── */
const 사람색전 = new Map<string, Set<string>>();
const 사람색후 = new Map<string, Set<string>>();
for (const x of 칸들) {
  for (const [표, 그림] of [[사람색전, x.전], [사람색후, x.후]] as const) {
    const s = 표.get(x.이름) ?? new Set<string>();
    for (const q of await usedColors(그림 as Buffer)) s.add(q);
    표.set(x.이름, s);
  }
}
const 이름들 = [...사람색후.keys()];
let 전합 = 0, 후합 = 0, 쌍 = 0;
console.log("\n색 겹침 (전 → 후)");
for (let i = 0; i < 이름들.length; i++) for (let j = i + 1; j < 이름들.length; j++) {
  const a = 이름들[i], b = 이름들[j];
  const 전 = paletteOverlap(사람색전.get(a)!, 사람색전.get(b)!);
  const 후 = paletteOverlap(사람색후.get(a)!, 사람색후.get(b)!);
  전합 += 전; 후합 += 후; 쌍++;
  console.log(`  ${a} ↔ ${b}   ${(전 * 100).toFixed(0)}% → ${(후 * 100).toFixed(0)}%`);
}
console.log(`  평균 ${((전합 / 쌍) * 100).toFixed(0)}% → ${((후합 / 쌍) * 100).toFixed(0)}%`);

/* 대조군 — 안 맞춘 원본 ↔ 맞춘 그림. 여기까지 올라가면 자가 거짓으로 높은 값을 준 것이다. */
let 대조합 = 0, 대조쌍 = 0;
for (let i = 0; i < 이름들.length; i++) for (let j = 0; j < 이름들.length; j++) {
  if (i === j) continue;
  대조합 += paletteOverlap(사람색전.get(이름들[i])!, 사람색후.get(이름들[j])!);
  대조쌍++;
}
console.log(`  대조군(원본 ↔ 맞춘 것) 평균 ${((대조합 / 대조쌍) * 100).toFixed(0)}%  ← 낮아야 자를 믿을 수 있다`);

/* 색만 갈아탔으니 격자는 그대로여야 한다 — ③ 칸만 예외. */
const 후길 = 칸들.map((x, i) => {
  const p = join(터, `after-${i}.png`);
  writeFileSync(p, x.후);
  return p.split("\\").join("/");
});
const 후도트 = 도트재기(후길);
const 깨짐: string[] = [];
칸들.forEach((x, i) => {
  if (x.격자고침) {
    console.log(`  고침 ${x.이름} ${x.감정}: 도트 ${전도트[i].t ?? "못 잼"}(순도 ${전도트[i].p?.toFixed(2) ?? "-"}) → ${후도트[i].t ?? "못 잼"}(순도 ${후도트[i].p?.toFixed(2) ?? "-"})`);
    return;
  }
  if (전도트[i].t !== 후도트[i].t) 깨짐.push(`${x.이름} ${x.감정}: 도트 ${전도트[i].t}→${후도트[i].t}`);
});
console.log(깨짐.length ? `\n틀림  격자가 밀린 칸 ${깨짐.length}개:\n  ${깨짐.join("\n  ")}` : `\n맞음  색만 바뀌고 도트 크기는 ${칸들.length - 깨진칸.length}칸 전부 그대로`);

/* ── 4. 사람이 볼 사진: 전/후 한 줄 ── */
for (const x of 칸들) {
  const d = join(나갈곳, x.slug);
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, `${x.감정.replace(":", "-")}.png`), x.후);
}
const 뽑을것 = 공개.map((c) => 칸들.find((x) => x.slug === c.slug && x.감정 === "neutral")).filter(Boolean) as 칸[];
const 칸크기 = 220;
const 조각: OverlayOptions[] = [];
for (const [i, x] of 뽑을것.entries()) {
  조각.push({ input: await sharp(x.전).resize(칸크기, 칸크기).png().toBuffer(), left: i * 칸크기, top: 34 });
  조각.push({ input: await sharp(x.후).resize(칸크기, 칸크기).png().toBuffer(), left: i * 칸크기, top: 34 + 칸크기 + 28 });
}
const 폭 = 칸크기 * 뽑을것.length;
const svg = `<svg width="${폭}" height="${34 + 칸크기 * 2 + 28}"><style>text{font-family:sans-serif;font-size:19px;fill:#fff}</style>` +
  `<text x="8" y="24">전 — 사람마다 색표 따로 (겹침 ${((전합 / 쌍) * 100).toFixed(0)}%)</text>` +
  `<text x="8" y="${34 + 칸크기 + 21}">후 — 피드에서 뽑은 ${색표.length}색 하나로 (겹침 ${((후합 / 쌍) * 100).toFixed(0)}%)</text></svg>`;
조각.push({ input: Buffer.from(svg), left: 0, top: 0 });
const 줄사진 = join(나갈곳, "_전후.png");
await sharp({ create: { width: 폭, height: 34 + 칸크기 * 2 + 28, channels: 4, background: { r: 24, g: 24, b: 32, alpha: 1 } } })
  .composite(조각).png().toFile(줄사진);
console.log(`\n${줄사진}`);
console.log(`${나갈곳} 에 ${칸들.length}칸 쌓았다  (${째()})`);

/* ── 5. 올리기는 사장님 말이 있을 때만 ── */
if (!올릴까) {
  console.log(`\n올리지 않았다. 통에 넣으려면 --up (원본은 통에 그대로 있다).`);
} else if (깨짐.length) {
  console.log(`\n격자가 밀린 칸이 있어 올리지 않는다.`);
} else {
  for (const x of 칸들) {
    const 길 = `${x.slug}/${x.감정.replace(":", "-")}.png`;
    const { error: e } = await db.storage.from("dot-sprites").upload(길, x.후, { contentType: "image/png", upsert: true });
    console.log(`  ${e ? `✗ ${길} ${e.message}` : `✓ ${길}`}`);
  }
  console.log(`올렸다  (${째()})`);
}
