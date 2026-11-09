/**
 * # 기준에 맞춘다 — **바닥선 하나로**  (11-09)
 *
 *   npx tsx engine/tools/dot_standardize.mts            ← 재기만
 *   npx tsx engine/tools/dot_standardize.mts --fix      ← public 의 그림을 옮긴다
 *
 * 사장님: *"지금 캐릭터 기준점이 없어서 퀄리티가 다 달라. 이건 큰 문제야."*
 *
 * 도트 크기는 맞췄다(`dot_regrid`). 남은 것이 **발밑**이다 — 아래 여백이 0~24화소라
 * 같은 줄에 세우면 누구는 떠 있고 누구는 바닥에 붙어 있다. 말풍선 옆 얼굴도 그만큼 밀린다.
 *
 * ## 그림은 한 점도 안 바꾼다
 *
 * **도트 칸 수만큼만** 내린다(8의 배수). 비정수로 옮기면 격자가 깨진다.
 * 옮긴 뒤 **잉크 칸 수와 도트 크기가 그대로인지** 보고, 달라지면 그 칸은 안 쓴다 —
 * 옮기는 일 자체가 깨지면 바로 걸린다(이 검사가 이 도구의 심은 고장이다).
 *
 * 멘헤라 칸(`<이름>/menhera/*.png`)도 같이 옮긴다. 한 사람 안에서 바닥선이 갈리면 더 나쁘다.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
const sharp = (await import("sharp")).default;
const { ALPHA_MIN } = await import("../../src/lib/dot/fringe");
const { faceCrop } = await import("./dot_faces_lib");

const 고칠까 = process.argv.includes("--fix");
const 사람 = ["doyun", "haru", "jiwoo", "nabi", "rin", "seoha", "soeun", "taeo", "yeonu", "yuna"];
/** 기준 — 발밑이 캔버스 바닥에 닿는다. */
const 목표여백 = 0;

function 도트재기(paths: string[]): (number | null)[] {
  if (!paths.length) return [];
  const py = [
    "import sys, json", "sys.path.insert(0, 'engine/genesis')", "import texel_judge as T",
    `paths = ${JSON.stringify(paths)}`,
    "print(json.dumps([T.measure_one(p).get('texel') for p in paths]))",
  ].join(String.fromCharCode(10));
  return JSON.parse(execFileSync("python", ["-c", py], { encoding: "utf8", cwd: process.cwd() }).trim().split(String.fromCharCode(10)).pop()!);
}

async function 잉크(png: Buffer) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, ch = info.channels;
  let 아래 = -1, 칸수 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (data[(y * W + x) * ch + 3] >= ALPHA_MIN) { 칸수++; if (y > 아래) 아래 = y; }
  }
  return { 여백: H - 1 - 아래, 칸수, W, H };
}

const 길모음: string[] = [];
for (const s of 사람) {
  for (const f of readdirSync(`public/dot-sprites/${s}`)) if (f.endsWith(".png")) 길모음.push(`public/dot-sprites/${s}/${f}`);
  const m = `public/dot-sprites/${s}/menhera`;
  if (existsSync(m)) for (const f of readdirSync(m)) if (f.endsWith(".png")) 길모음.push(`${m}/${f}`);
}
const 도트 = 도트재기(길모음);
console.log(`칸 ${길모음.length}개 — 아래 여백이 0 이 아닌 것만 적는다`);
let 옮길것 = 0, 옮김 = 0, 막힘 = 0;
for (const [i, p] of 길모음.entries()) {
  const t = 도트[i];
  if (!t) { console.log(`  ${p} 도트를 못 잼 — 건드리지 않는다`); 막힘++; continue; }
  const png = readFileSync(p);
  const 전 = await 잉크(png);
  if (전.여백 === 목표여백) continue;
  옮길것++;
  const 내릴칸 = Math.floor(전.여백 / t);
  if (내릴칸 < 1) { console.log(`  ${p} 여백 ${전.여백}화소 — 한 칸(${t})보다 작아 못 내린다`); continue; }
  console.log(`  ${p.replace("public/dot-sprites/", "")} 여백 ${전.여백} → ${전.여백 - 내릴칸 * t} (${내릴칸}칸 내림)`);
  if (!고칠까) continue;
  const 옮긴것 = await sharp({ create: { width: 전.W, height: 전.H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: png, top: 내릴칸 * t, left: 0 }]).png().toBuffer();
  const 후 = await 잉크(옮긴것);
  if (후.칸수 !== 전.칸수) { console.log(`    ❌ 잉크가 ${전.칸수}→${후.칸수} 로 달라졌다 — 안 쓴다`); 막힘++; continue; }
  writeFileSync(p, 옮긴것);
  /* 얼굴은 몸에서 잘라낸다 — 몸을 옮겼으면 같이 다시 잘라야 자리가 안 밀린다. */
  const 얼굴길 = p.includes("/menhera/") ? p.replace("/menhera/", "/menhera/face/") : p.replace(/\/([^/]+)\.png$/, "/face/$1.png");
  if (existsSync(얼굴길)) writeFileSync(얼굴길, await faceCrop(옮긴것));
  옮김++;
}
const 후도트 = 고칠까 ? 도트재기(길모음) : 도트;
const 밀림 = 길모음.map((p, i) => (도트[i] && 도트[i] !== 후도트[i] ? `${p} ${도트[i]}→${후도트[i]}` : "")).filter(Boolean);
console.log(`\n옮겨야 할 칸 ${옮길것}개 · 옮긴 칸 ${옮김}개 · 막힌 칸 ${막힘}개`);
console.log(밀림.length ? `❌ 도트가 밀린 칸 ${밀림.length}개: ${밀림.slice(0, 3).join(", ")}` : `✅ 도트 크기는 전부 그대로`);
if (!고칠까) console.log(`재기만 했다. 옮기려면 --fix`);
