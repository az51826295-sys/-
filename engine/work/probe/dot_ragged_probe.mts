/**
 * **"린 유나 잘 안잘림"을 재는 자 고르기** — 사장님이 집은 둘이 위로 올라오는 자만 쓴다.
 *
 * ΔE 테두리 자는 도윤을 1등, 린을 꼴찌로 놨다 → 그 자는 이 불평을 재는 자가 아니다.
 * 그래서 후보를 여럿 놓고, **사장님 말과 순위가 맞는 것**을 고른다. 안 맞으면 전부 버린다. 11-08.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
const { createClient } = await import("@supabase/supabase-js");
const sharp = (await import("sharp")).default;
const { toLab, deltaE } = await import("../../../src/lib/dot/fringe");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data } = await db.from("dot_characters").select("slug, name, sprites, is_public");
const 공개 = (data as any[]).filter((c) => c.is_public && c.sprites).sort((a, b) => a.slug.localeCompare(b.slug));
const 터 = join(process.env.TEMP ?? ".", `ragged-${Date.now()}`); mkdirSync(터, { recursive: true });

function 도트재기(paths: string[]): (number | null)[] {
  const py = ["import sys, json", "sys.path.insert(0, 'engine/genesis')", "import texel_judge as T",
    `paths = ${JSON.stringify(paths)}`, "print(json.dumps([T.measure_one(p).get('texel') for p in paths]))"].join("\n");
  return JSON.parse(execFileSync("python", ["-c", py], { encoding: "utf8", cwd: process.cwd() }).trim().split("\n").pop()!);
}

type 칸 = { 이름: string; 감정: string; png: Buffer; 길: string; t: number | null };
const 칸들: 칸[] = [];
for (const c of 공개) for (const [감정, url] of Object.entries(c.sprites as Record<string, string>)) {
  const r = await fetch(url); if (!r.ok) continue;
  const png = Buffer.from(await r.arrayBuffer());
  const 길 = join(터, `${c.slug}__${감정.replace(":", "-")}.png`).split("\\").join("/");
  writeFileSync(길, png);
  칸들.push({ 이름: c.name, 감정, png, 길, t: null });
}
const 도트 = 도트재기(칸들.map((x) => x.길));
칸들.forEach((x, i) => (x.t = 도트[i]));

type 셈 = { 튀어나옴: number; 둘레: number; 잉크: number; 밝은티끌: number; 테두리: number; 외톨이줄: number };
async function 세기(png: Buffer, t: number): Promise<셈> {
  const { data: raw, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, ch = info.channels;
  const 가로 = Math.floor(W / t), 세로 = Math.floor(H / t);
  const 색: (null | [number, number, number])[] = [];
  for (let gy = 0; gy < 세로; gy++) for (let gx = 0; gx < 가로; gx++) {
    const p = ((gy * t + (t >> 1)) * W + gx * t + (t >> 1)) * ch;
    색.push(raw[p + 3] >= 16 ? [raw[p], raw[p + 1], raw[p + 2]] : null);
  }
  const lab = 색.map((c) => (c ? toLab(c[0], c[1], c[2]) : null));
  const L들 = lab.filter(Boolean).map((l) => l![0]).sort((a, b) => a - b);
  const 가운데L = L들[Math.floor(L들.length / 2)] ?? 0;

  let 튀어나옴 = 0, 둘레 = 0, 잉크 = 0, 밝은티끌 = 0, 테두리 = 0, 외톨이줄 = 0;
  for (let gy = 0; gy < 세로; gy++) for (let gx = 0; gx < 가로; gx++) {
    const i = gy * 가로 + gx;
    if (!색[i]) continue;
    잉크++;
    let 빈이웃 = 0; const 잉크이웃: number[] = [];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = gx + dx, ny = gy + dy;
      if (nx < 0 || ny < 0 || nx >= 가로 || ny >= 세로 || !색[ny * 가로 + nx]) 빈이웃++;
      else 잉크이웃.push(ny * 가로 + nx);
    }
    둘레 += 빈이웃;
    if (!빈이웃) continue;
    테두리++;
    if (빈이웃 >= 3) 튀어나옴++;                       // 가시처럼 혼자 튀어나온 도트
    if (잉크이웃.length) {
      let 가까움 = Infinity;
      for (const k of 잉크이웃) 가까움 = Math.min(가까움, deltaE(lab[i]!, lab[k]!));
      if (가까움 > 10 && lab[i]![0] > 가운데L + 25) 밝은티끌++;   // 주변보다 **밝은** 쪽으로만 동떨어진 것
    }
    /* 가로로 1칸짜리 선: 좌우가 비었는데 위아래 중 하나만 붙은 것 = 머리카락 끄트머리 */
    const 왼 = gx > 0 && 색[i - 1], 오 = gx < 가로 - 1 && 색[i + 1];
    if (!왼 && !오) 외톨이줄++;
  }
  return { 튀어나옴, 둘레, 잉크, 밝은티끌, 테두리, 외톨이줄 };
}

const 합 = new Map<string, 셈>();
for (const x of 칸들) {
  if (!x.t) continue;
  const s = await 세기(x.png, x.t);
  const a = 합.get(x.이름) ?? { 튀어나옴: 0, 둘레: 0, 잉크: 0, 밝은티끌: 0, 테두리: 0, 외톨이줄: 0 };
  for (const k of Object.keys(s) as (keyof 셈)[]) a[k] += s[k];
  합.set(x.이름, a);
}

const 집은사람 = new Set(["린", "유나"]);
function 줄세우기(이름: string, 값: (s: 셈) => number) {
  const 줄 = [...합].map(([n, s]) => [n, 값(s)] as const).sort((a, b) => b[1] - a[1]);
  const 자리 = 줄.map(([n]) => n).map((n, i) => (집은사람.has(n) ? i + 1 : 0)).filter(Boolean);
  const 맞나 = 자리.every((r) => r <= 2);
  console.log(`\n${이름}  ${맞나 ? "✅ 린·유나가 1·2위 — 이 자가 사장님 말과 맞는다" : `❌ 린·유나가 ${자리.join("·")}위`}`);
  for (const [n, v] of 줄) console.log(`   ${집은사람.has(n) ? "▶" : " "} ${n.padEnd(5)} ${v.toFixed(2)}`);
}
줄세우기("① 튀어나온 도트 / 테두리", (s) => (s.튀어나옴 / s.테두리) * 100);
줄세우기("② 둘레 / 잉크 (너덜 지수)", (s) => (s.둘레 / s.잉크) * 100);
줄세우기("③ 밝은 티끌 / 테두리", (s) => (s.밝은티끌 / s.테두리) * 100);
줄세우기("④ 가로 1칸짜리 선 / 잉크", (s) => (s.외톨이줄 / s.잉크) * 100);
