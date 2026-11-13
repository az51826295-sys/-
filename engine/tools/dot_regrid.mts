/**
 * # 도트 크기를 기준에 맞춘다  (11-09)
 *
 *   npx tsx engine/tools/dot_regrid.mts taeo,jiwoo,soeun            ← 재기만
 *   npx tsx engine/tools/dot_regrid.mts taeo,jiwoo,soeun --fix      ← 다시 뭉개 public 에 쓴다
 *
 * 11-09 오후에 만든 셋은 **도트 2**(격자 256)로 나왔다. 옛 일곱과 멘헤라 24칸·얼굴 84개가
 * 전부 **도트 8** 이라 한 줄에 세우면 결이 둘이다(`engine/docs/dot-character-standard.md`).
 *
 * **시트에서 다시 자른다** — 이미 그린 시트(1536×1024)가 있으니 **그림값 0** 이고,
 * 512 짜리를 줄였다 키우는 것보다 원본에서 격자 64 로 내려가는 쪽이 선명하다.
 * 뭉갠 뒤 테두리를 두르고 얼굴까지 다시 잘라야 **한 사람 안에서도** 결이 안 갈린다.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
const sharp = (await import("sharp")).default;
const { cutSheet, pixelize } = await import("../../src/lib/dot/sprites");
const { outlineSprite, outlineShare, OUTLINE_MIN } = await import("../../src/lib/dot/outline");
const { faceCrop, faceCropCheck } = await import("./dot_faces_lib");

const 이름들 = (process.argv[2] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
if (!이름들.length) { console.error("누구를 맞출지 적어 주세요: taeo,jiwoo,soeun"); process.exit(1); }
const 고칠까 = process.argv.includes("--fix");
const 시트 = "C:/Users/az518/Desktop/두근도트-시트";
/**
 * 기준 — **도트 4 = 격자 128**(`engine/docs/dot-character-standard.md`).
 *
 * 11-13: 여기 `64`(도트 8)가 박혀 있었다. 11-09 에 열 명을 `dot_restyle_all --grid 128` 로
 * 다시 뽑아 **기준이 4로 바뀌었는데 이 도구만 옛 숫자로 남아 있었다** — 이걸로 고치면
 * 고친 사람만 또 혼자 결이 달라진다. 문서가 기준이고 도구는 따라간다.
 */
const { 격자: 기준격자, 캔버스 } = await import("../../src/lib/dot/charStandard");
const 격자 = Number((process.argv.find((a) => a.startsWith("--grid=")) ?? `--grid=${기준격자}`).split("=")[1]), 도트 = 캔버스 / 격자;

function 도트재기(paths: string[]): (number | null)[] {
  const py = [
    "import sys, json", "sys.path.insert(0, 'engine/genesis')", "import texel_judge as T",
    `paths = ${JSON.stringify(paths)}`,
    "print(json.dumps([T.measure_one(p).get('texel') for p in paths]))",
  ].join(String.fromCharCode(10));
  return JSON.parse(execFileSync("python", ["-c", py], { encoding: "utf8", cwd: process.cwd() }).trim().split(String.fromCharCode(10)).pop()!);
}

for (const slug of 이름들) {
  const 시트길 = `${시트}/${slug}-sheet.png`;
  if (!existsSync(시트길)) { console.log(`${slug} — 시트가 없다(${시트길}). 다시 그려야 한다.`); continue; }
  const 지금 = 도트재기([`public/dot-sprites/${slug}/neutral.png`])[0];
  console.log(`${slug} — 지금 도트 ${지금 ?? "못 잼"} → 기준 ${도트}`);
  if (!고칠까) continue;

  const 자른것 = await cutSheet("data:image/png;base64," + readFileSync(시트길).toString("base64"));
  const 쓴것: string[] = [];
  for (const c of 자른것) {
    const 뭉갬 = await pixelize(c.png, 격자);
    const { png } = await outlineSprite(뭉갬, 도트, { 식: "한색", 색: [255, 255, 255] }, 1);
    mkdirSync(`public/dot-sprites/${slug}/face`, { recursive: true });
    writeFileSync(`public/dot-sprites/${slug}/${c.emotion}.png`, png);
    writeFileSync(`public/dot-sprites/${slug}/face/${c.emotion}.png`, await faceCrop(png));
    쓴것.push(`public/dot-sprites/${slug}/${c.emotion}.png`);
  }
  /* 자 — 도트가 기준이 됐나 · 테두리가 둘러졌나 · 얼굴이 자리에 있나 */
  const 후 = 도트재기(쓴것);
  const 틀림: string[] = [];
  for (const [i, p] of 쓴것.entries()) {
    if (후[i] !== 도트) 틀림.push(`${p.split("/").pop()} 도트 ${후[i]}`);
    const r = await outlineShare(readFileSync(p), 도트);
    if (r.비율 < OUTLINE_MIN) 틀림.push(`${p.split("/").pop()} 테두리 ${(r.비율 * 100).toFixed(0)}%`);
    const f = await faceCropCheck(readFileSync(p.replace(`/${slug}/`, `/${slug}/face/`)));
    if (f.centerY < 0.55 || f.centerY > 0.8) 틀림.push(`${p.split("/").pop()} 얼굴 가운데 ${(f.centerY * 100).toFixed(0)}%`);
  }
  console.log(틀림.length ? `   ❌ ${틀림.join(" · ")}` : `   ✅ 여섯 칸 전부 도트 ${도트} · 테두리 · 얼굴 자리 맞음`);
}
if (!고칠까) console.log(`\n재기만 했다. 맞추려면 --fix`);
