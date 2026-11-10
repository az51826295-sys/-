/**
 * # 얼굴을 **진짜 도트로** 다시 자른다  (11-10)
 *
 *   npx tsx engine/tools/dot_faces_regrid.mts            ← 열 명 전부
 *   npx tsx engine/tools/dot_faces_regrid.mts --only rin --dry
 *
 * `truedot` 을 만들어 제품에 대 봤더니 **얼굴 스프라이트가 도트가 아니었다** — 격자 1.6화소.
 * 몸은 도트 4 인데 얼굴만 1.6 이면 같은 사람으로 안 보이고, 11-10 부터는 그 얼굴이
 * **이모티콘**으로도 쓰인다. 범인은 크롭의 마지막 한 줄(아무 자리에서 잘라 96 으로 줄이기)이고
 * `dot_faces_lib` 에서 고쳤다. 이 도구는 그 고친 규칙으로 **이미 올라간 그림에서 다시 자른다.**
 *
 * 읽는 곳과 쓰는 곳 둘 다 `public/dot-sprites/` 다 — 앱이 통이 아니라 **거기서 내보낸다**
 * ([[rookery-prod-db-is-gone]] 옆에 적어 둔 그 함정). 통에 올리면 앱에는 안 보인다.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
const sharp = (await import("sharp")).default;
const { faceCrop, faceCropCheck } = await import("./dot_faces_lib");

const 끌 = (이름: string) => { const i = process.argv.indexOf(이름); return i > 0 ? process.argv[i + 1] : undefined; };
const only = 끌("--only")?.split(",");
const dry = process.argv.includes("--dry");
const 사람 = (only ?? ["doyun", "haru", "jiwoo", "nabi", "rin", "seoha", "soeun", "taeo", "yeonu", "yuna"]);
const 감정 = ["neutral", "happy", "shy", "sad", "angry", "surprised"];

/** 도트 크기를 **파이썬 자로** 잰다 — 고쳤다고 적지 않고 잰다. */
function 도트재기(paths: string[]): (number | null)[] {
  if (!paths.length) return [];
  const py = [
    "import sys, json", "sys.path.insert(0, 'engine/genesis')", "import texel_judge as T",
    `paths = ${JSON.stringify(paths)}`,
    "print(json.dumps([T.measure_one(p).get('texel') for p in paths]))",
  ].join(String.fromCharCode(10));
  return JSON.parse(execFileSync("python", ["-X", "utf8", "-I", "-c", py], { encoding: "utf8", cwd: process.cwd() }).trim().split(String.fromCharCode(10)).pop()!);
}

const 만든것: string[] = [];
let 나쁨 = 0;
for (const s of 사람) {
  const 묶음: string[] = [];
  for (const [뿌리, 밑] of [[`public/dot-sprites/${s}`, ""], [`public/dot-sprites/${s}/menhera`, "menhera "]] as const) {
    if (!existsSync(뿌리)) continue;
    const 있는칸 = readdirSync(뿌리).filter((f) => f.endsWith(".png")).map((f) => f.replace(".png", ""));
    const 할것 = 감정.filter((e) => 있는칸.includes(e));
    if (!할것.length) continue;
    mkdirSync(`${뿌리}/face`, { recursive: true });
    for (const e of 할것) {
      const face = await faceCrop(readFileSync(`${뿌리}/${e}.png`));
      const c = await faceCropCheck(face);
      /*
       * **기준을 두 개 들고 있지 않는다.** `faceCropCheck.ok` 는 9월에 쓰던 문턱(가운데 35~65%)인데,
       * 지금 제품 기준은 `dot_character_spec` 의 **55~80%** 다. 옛 자로 재면 지금 올라가 있는
       * 열 명이 전부 떨어진다 — 쓰고 있는 그림이 떨어지면 **자를 먼저 의심한다**
       * ([[palette-overlap-is-not-style]]).
       */
      const 좋은가 = c.centerY >= 0.55 && c.centerY <= 0.8 && c.skinRatio >= 0.12;
      /*
       * 틀이 조금 어긋나도 **쓴다.** 고치려는 것은 격자이고, 안 쓰면 그 한 칸만 옛 그림
       * (도트 1.6)으로 남아 같은 줄에서 혼자 결이 다르다 — 둘 다 나쁘면 **덜 나쁜 쪽**을 쓰고
       * 어긋난 것은 적어서 낸다. 조용히 건너뛰면 섞인 것을 아무도 모른다.
       */
      if (!좋은가) { 나쁨++; 묶음.push(`❌${밑}${e} 틀 가운데${Math.round(c.centerY * 100)}% 살${Math.round(c.skinRatio * 100)}%`); }
      if (!dry) writeFileSync(`${뿌리}/face/${e}.png`, face);
      만든것.push(`${뿌리}/face/${e}.png`);
    }
    const m = await sharp(`${뿌리}/face/${할것[0]}.png`).metadata();
    묶음.push(`${밑}${할것.length}장 ${m.width}x${m.height}`);
  }
  console.log(`  ${s.padEnd(7)} ${묶음.join(" · ")}`);
}

/* ── 잰다 ─────────────────────────────────────────────── */
const 도트 = 도트재기(만든것);
const 센것 = new Map<string, number>();
for (const t of 도트) 센것.set(String(t ?? "못 잼"), (센것.get(String(t ?? "못 잼")) ?? 0) + 1);
console.log(`\n얼굴 ${만든것.length}장 · 도트 ${[...센것].map(([k, v]) => `${k}×${v}장`).join(" · ")}`);
const 아닌것 = 도트.filter((t) => t !== 4).length;
if (아닌것) { console.log(`❌ 도트 4 가 아닌 얼굴 ${아닌것}장`); 나쁨 += 아닌것; }
console.log(dry ? "\n(dry — 쓰지 않았다)" : "\n**배포해야 앱에서 보인다** — railway up --service dot-web --ci");
process.exit(나쁨 ? 1 : 0);
