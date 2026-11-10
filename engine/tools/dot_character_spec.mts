/**
 * # 캐릭터 기준점 — **열 명을 같은 자로 재서 숫자를 깐다**  (11-09)
 *
 *   npx tsx engine/tools/dot_character_spec.mts
 *
 * 사장님: *"기준점 제대로 만들어, 지금 캐릭터 대충 만들었잖아."* 맞는 말이다.
 * 오늘 새로 만든 셋은 **도트 2**(격자 256), 옛 일곱은 **도트 8**(격자 64)이다 —
 * 같은 줄에 세우면 결이 둘이다. 그 외에도 잉크 폭이 344~480 으로 제각각인 것을
 * 아침에 재 놓고 "그리는 쪽에서 맞춰야 한다" 로 남겨 뒀다.
 *
 * 기준은 **지어내지 않고 지금 것에서 뽑는다**: 사장님이 받아들인 일곱 명의 가운데값을 보고,
 * 거기서 벗어난 것을 벗어났다고 말한다. 먼저 재고, 그다음에 기준을 잠근다
 * ([[lock-criteria-must-compute]]).
 *
 * 재는 칸
 *   도트 크기 · 잉크 폭/높이(칸) · 머리 비율(머리 높이 ÷ 전체) · 색 수 · 테두리 · 얼굴 가운데
 *
 * `--check` 를 주면 **기준을 벗어난 사람이 있으면 1 로 끝난다** — 켜는 문과 만드는 길이 이걸 부른다.
 */
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
const sharp = (await import("sharp")).default;
const { outlineShare } = await import("../../src/lib/dot/outline");
const { faceCropCheck } = await import("./dot_faces_lib");
const { ALPHA_MIN } = await import("../../src/lib/dot/fringe");

const 사람 = ["doyun", "haru", "jiwoo", "nabi", "rin", "seoha", "soeun", "taeo", "yeonu", "yuna"];
const 새것 = ["jiwoo", "soeun", "taeo"];

function 도트재기(paths: string[]): (number | null)[] {
  const py = [
    "import sys, json",
    "sys.path.insert(0, 'engine/genesis')",
    "import texel_judge as T",
    `paths = ${JSON.stringify(paths)}`,
    "print(json.dumps([T.measure_one(p).get('texel') for p in paths]))",
  ].join(String.fromCharCode(10));
  return JSON.parse(execFileSync("python", ["-c", py], { encoding: "utf8", cwd: process.cwd() }).trim().split(String.fromCharCode(10)).pop()!);
}

/** 잉크 상자와 **머리 높이** — 머리는 위에서부터 살색이 처음 나오는 줄까지로 본다(머리카락). */
async function 몸재기(png: Buffer, texel: number) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, ch = info.channels;
  let x0 = W, x1 = -1, y0 = H, y1 = -1, 살첫줄 = -1;
  const 색 = new Set<string>();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = (y * W + x) * ch;
    if (data[p + 3] < ALPHA_MIN) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    색.add(`${data[p]},${data[p + 1]},${data[p + 2]}`);
    const r = data[p], g = data[p + 1], b = data[p + 2];
    if (살첫줄 < 0 && r > 185 && g > 135 && b > 100 && r >= g && g >= b && r - b >= 12 && r - b <= 110) 살첫줄 = y;
  }
  const 폭 = x1 - x0 + 1, 높이 = y1 - y0 + 1;
  return {
    폭칸: Math.round(폭 / texel), 높이칸: Math.round(높이 / texel),
    폭화소: 폭, 높이화소: 높이,
    머리비율: 살첫줄 > 0 ? (살첫줄 - y0) / 높이 : NaN,
    색수: 색.size,
    아래여백: H - 1 - y1,
  };
}

const 길들 = 사람.map((s) => `public/dot-sprites/${s}/neutral.png`);
const 도트 = 도트재기(길들);
console.log(`이름     새것  도트  폭(칸)  높이(칸)  폭(화소)  머리비율  색수  테두리  얼굴가운데  아래여백`);
const 표: any[] = [];
for (const [i, s] of 사람.entries()) {
  const t = 도트[i];
  if (!t) { console.log(`${s.padEnd(8)} 도트를 못 잼`); continue; }
  const png = readFileSync(길들[i]);
  const m = await 몸재기(png, t);
  const o = await outlineShare(png, t);
  const f = existsSync(`public/dot-sprites/${s}/face/neutral.png`) ? await faceCropCheck(readFileSync(`public/dot-sprites/${s}/face/neutral.png`)) : null;
  표.push({ s, t, ...m, 테두리: o.비율, 얼굴: f?.centerY ?? NaN });
  console.log(
    `${s.padEnd(8)} ${새것.includes(s) ? " ●  " : "    "} ${String(t).padStart(4)} ${String(m.폭칸).padStart(6)} ${String(m.높이칸).padStart(8)} ` +
    `${String(m.폭화소).padStart(8)} ${(m.머리비율 * 100).toFixed(0).padStart(8)}% ${String(m.색수).padStart(5)} ${(o.비율 * 100).toFixed(0).padStart(6)}% ` +
    `${((f?.centerY ?? 0) * 100).toFixed(0).padStart(9)}% ${String(m.아래여백).padStart(8)}`,
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * **게시물 사진도 같은 판에서 잰다** (11-10)
 *
 * 사장님: *"다음에 헷갈리지 않게 기준점 설정했어? 사진."* 문서에는 적어 뒀는데
 * **재는 문이 사진은 "4장 이상 · 주소가 열리나" 만 보고 있었다** — 크기가 400×500 에서
 * 200×250 으로 되돌아가도 아무도 안 잡는다. 11-09 에 실제로 그 상태였고, 피드에서 1.9배로
 * 늘어나 뭉개져 보였다. 글로만 있는 기준은 기준이 아니다([[ruler-measured-but-never-counted]]).
 *
 * 재는 대상은 **앱이 내보내는 목록**(DB 의 photos) → 그 주소의 `public/` 파일이다.
 * (배포된 것과 `public/` 이 같다는 것은 `dot_served_match.mts` 가 따로 재고 있다.)
 * ────────────────────────────────────────────────────────────────────────── */
const { createClient } = await import("@supabase/supabase-js");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const { data: chars } = await db.from("dot_characters").select("slug, photos").in("slug", 사람);
const 사진길: string[] = [], 사진주인: string[] = [];
const 사진목록 = new Map<string, string[]>();
for (const s of 사람) {
  const c = (chars ?? []).find((x: any) => x.slug === s) as any;
  const 길 = ((c?.photos ?? []) as { url: string }[]).map((p) => `public/${p.url.replace(/^https?:\/\/[^/]+\//, "")}`);
  사진목록.set(s, 길);
  for (const p of 길) if (existsSync(p)) { 사진길.push(p); 사진주인.push(s); }
}
const 사진도트 = 사진길.length ? 도트재기(사진길) : [];
type 사진잼 = { 장수: number; 없는것: number; 크기틀림: string[]; 도트틀림: string[]; 색틀림: string[] };
const 사진표 = new Map<string, 사진잼>(사람.map((s) => [s, { 장수: (사진목록.get(s) ?? []).length, 없는것: (사진목록.get(s) ?? []).filter((p) => !existsSync(p)).length, 크기틀림: [], 도트틀림: [], 색틀림: [] }]));
const 사진기준 = { 가로: 400, 세로: 500, 도트: 2, 색수: [8, 32] as const, 장수: 8 };
for (const [i, p] of 사진길.entries()) {
  const 주인 = 사진표.get(사진주인[i])!;
  const m = await sharp(p).metadata();
  if (m.width !== 사진기준.가로 || m.height !== 사진기준.세로) 주인.크기틀림.push(`${m.width}x${m.height}`);
  if (사진도트[i] !== 사진기준.도트) 주인.도트틀림.push(String(사진도트[i] ?? "못 잼"));
  const { data, info } = await sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const 색 = new Set<string>();
  for (let q = 0; q < data.length; q += info.channels) 색.add(`${data[q]},${data[q + 1]},${data[q + 2]}`);
  if (색.size < 사진기준.색수[0] || 색.size > 사진기준.색수[1]) 주인.색틀림.push(String(색.size));
}
console.log(`\n게시물 사진 — 기준 ${사진기준.가로}x${사진기준.세로} · 도트 ${사진기준.도트} · 색 ${사진기준.색수[0]}~${사진기준.색수[1]} · ${사진기준.장수}장`);
for (const s of 사람) {
  const r = 사진표.get(s)!;
  const 말 = [r.장수 !== 사진기준.장수 ? `장수 ${r.장수}` : "", r.없는것 ? `파일 없음 ${r.없는것}` : "", r.크기틀림.length ? `크기 ${[...new Set(r.크기틀림)].join(",")}×${r.크기틀림.length}장` : "", r.도트틀림.length ? `도트 ${[...new Set(r.도트틀림)].join(",")}×${r.도트틀림.length}장` : "", r.색틀림.length ? `색 ${[...new Set(r.색틀림)].join(",")}×${r.색틀림.length}장` : ""].filter(Boolean);
  console.log(`  ${s.padEnd(8)} ${r.장수}장${말.length ? `  ❌ ${말.join(" · ")}` : "  맞음"}`);
}

/**
 * **기준** — `engine/docs/dot-character-standard.md`. 숫자는 일곱 명을 재서 뽑았고,
 * 바꾸려면 문서부터 고친다(여기만 고치면 글과 코드가 갈린다).
 */
/* 11-09 사장님 *"화질도 잘 나오게 하자"* → 격자 128(도트 4). 열 명을 **같은 판에** 다시 뽑아
   올렸다 — 한 명씩 올리면 또 갈린다. 칸 수 기준은 격자가 두 배라 그만큼 커진다. */
const 기준 = { 도트: 4, 높이칸: [110, 128] as const, 폭칸: [85, 128] as const, 색수: [12, 24] as const, 테두리: 0.9, 얼굴: [0.55, 0.8] as const, 아래여백: 0 };
if (process.argv.includes("--check")) {
  const 틀린것: string[] = [];
  for (const r of 표) {
    const 말: string[] = [];
    if (r.t !== 기준.도트) 말.push(`도트 ${r.t}`);
    if (r.높이칸 < 기준.높이칸[0] || r.높이칸 > 기준.높이칸[1]) 말.push(`높이 ${r.높이칸}칸`);
    if (r.폭칸 < 기준.폭칸[0] || r.폭칸 > 기준.폭칸[1]) 말.push(`폭 ${r.폭칸}칸`);
    if (r.색수 < 기준.색수[0] || r.색수 > 기준.색수[1]) 말.push(`색 ${r.색수}`);
    if (r.테두리 < 기준.테두리) 말.push(`테두리 ${(r.테두리 * 100).toFixed(0)}%`);
    if (r.얼굴 < 기준.얼굴[0] || r.얼굴 > 기준.얼굴[1]) 말.push(`얼굴 ${(r.얼굴 * 100).toFixed(0)}%`);
    if (r.아래여백 !== 기준.아래여백) 말.push(`아래여백 ${r.아래여백}`);
    const 사 = 사진표.get(r.s)!;
    if (사.장수 !== 사진기준.장수) 말.push(`사진 ${사.장수}장`);
    if (사.없는것) 말.push(`사진 파일 없음 ${사.없는것}`);
    if (사.크기틀림.length) 말.push(`사진 크기 ${[...new Set(사.크기틀림)].join(",")}(${사.크기틀림.length}장)`);
    if (사.도트틀림.length) 말.push(`사진 도트 ${[...new Set(사.도트틀림)].join(",")}(${사.도트틀림.length}장)`);
    if (사.색틀림.length) 말.push(`사진 색 ${[...new Set(사.색틀림)].join(",")}(${사.색틀림.length}장)`);
    if (말.length) 틀린것.push(`${r.s}: ${말.join(" · ")}`);
  }
  console.log(`
기준 검사 — 벗어난 사람 ${틀린것.length}/${표.length}`);
  for (const t of 틀린것) console.log(`  ❌ ${t}`);
  process.exit(틀린것.length ? 1 : 0);
}

const 가운데 = (xs: number[]) => { const a = [...xs].sort((p, q) => p - q); return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2; };
const 옛것 = 표.filter((r) => !새것.includes(r.s));
console.log(`\n사장님이 받아들인 일곱 명의 가운데값 — 기준은 여기서 뽑는다`);
console.log(`  도트 ${가운데(옛것.map((r) => r.t))} · 폭 ${가운데(옛것.map((r) => r.폭화소))}화소 · 높이 ${가운데(옛것.map((r) => r.높이화소))}화소`);
console.log(`  머리비율 ${(가운데(옛것.map((r) => r.머리비율)) * 100).toFixed(0)}% · 색수 ${가운데(옛것.map((r) => r.색수))} · 아래여백 ${가운데(옛것.map((r) => r.아래여백))}화소`);
console.log(`  폭 범위 ${Math.min(...옛것.map((r) => r.폭화소))}~${Math.max(...옛것.map((r) => r.폭화소))} · 높이 범위 ${Math.min(...옛것.map((r) => r.높이화소))}~${Math.max(...옛것.map((r) => r.높이화소))}`);
console.log(`\n새로 만든 셋`);
for (const r of 표.filter((x) => 새것.includes(x.s))) {
  console.log(`  ${r.s.padEnd(7)} 도트 ${r.t} · 폭 ${r.폭화소} · 높이 ${r.높이화소} · 머리 ${(r.머리비율 * 100).toFixed(0)}% · 색 ${r.색수}`);
}
