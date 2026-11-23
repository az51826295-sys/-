/**
 * **AI 도트 vs 기계로 맞춘 도트 — 나란히 한 장** (11-23, 스레드 첫 글 재료 · 사장님 "하고 올려").
 *   npx tsx engine/tools/dot_before_after.mts [slug=yuna] [감정=happy]
 *   → 바탕화면/두근도트-스레드/<slug>-before-after.png (+ 얼굴 확대 한 장)
 *
 * 새 그림을 그리지 않는다. 이미 그려 둔 AI 시트(바탕화면/두근도트-시트)를 dot_regrid 와 **같은 손질**
 * (pixelize 격자 128 · 24색)로 바꿔, 같은 자리를 8배 확대해 나란히 놓는다. 숫자는 도트 크기 자(texel_judge)가 잰다.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
for (const l of readFileSync(".env.local", "utf8").split(/\r?\n/)) { const i = l.indexOf("="); if (i > 0 && /^[A-Z_]+$/.test(l.slice(0, i))) process.env[l.slice(0, i)] ??= l.slice(i + 1).replace(/^"|"$/g, ""); }
const sharp = (await import("sharp")).default;
const { cutSheet, pixelize } = await import("../../src/lib/dot/sprites");
const { 격자: 기준격자 } = await import("../../src/lib/dot/charStandard");
const 격자 = Number((process.argv.find((a) => a.startsWith("--grid=")) ?? `--grid=${기준격자}`).split("=")[1]);

const 인자 = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const slug = 인자[0] ?? "yuna", 감정 = 인자[1] ?? "happy";
const OUT = "C:/Users/az518/Desktop/두근도트-스레드";
mkdirSync(OUT, { recursive: true });
const 칸들 = await cutSheet("data:image/png;base64," + readFileSync(`C:/Users/az518/Desktop/두근도트-시트/${slug}-sheet.png`).toString("base64"));
const 칸 = 칸들.find((c) => c.emotion === 감정) ?? 칸들[0];
const 원본 = await sharp(칸.png).resize(512, 512, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } }).png().toBuffer();
const 맞춤 = await pixelize(칸.png, 격자, 512);
writeFileSync(`${OUT}/_before.png`, 원본); writeFileSync(`${OUT}/_after.png`, 맞춤);

// 도트 크기 자로 둘 다 잰다
const py = ["import sys, json", "sys.path.insert(0, 'engine/genesis')", "import texel_judge as T",
  `print(json.dumps([T.measure_one(p) for p in ${JSON.stringify([`${OUT}/_before.png`, `${OUT}/_after.png`])}], default=str))`].join("\n");
const 잰것 = JSON.parse(execFileSync("python", ["-c", py]).toString()) as Record<string, unknown>[];
console.log(JSON.stringify(잰것, null, 1).slice(0, 1500));

// 얼굴 쪽 128×128 자리를 8배 — 같은 자리
const 자리 = { left: 192, top: 96, width: 128, height: 128 };
const 확대 = async (b: Buffer) => sharp(await sharp(b).extract(자리).png().toBuffer()).resize(512, 512, { kernel: "nearest" }).flatten({ background: "#ffffff" }).png().toBuffer();
const W = 1080, 위 = 140;
const 판 = async (a: Buffer, b: Buffer, 이름: string) => {
  const svg = `<svg width="${W}" height="${위 + 512 + 120}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#fff"/>
  <text x="${W / 4 + 8}" y="${위 - 40}" font-family="Malgun Gothic, sans-serif" font-size="44" font-weight="700" text-anchor="middle" fill="#111">AI 원본</text>
  <text x="${W * 3 / 4 - 8}" y="${위 - 40}" font-family="Malgun Gothic, sans-serif" font-size="44" font-weight="700" text-anchor="middle" fill="#e2557a">기계로 맞춤</text>
  <text x="${W / 2}" y="${위 + 512 + 80}" font-family="Malgun Gothic, sans-serif" font-size="30" text-anchor="middle" fill="#777">${이름}</text></svg>`;
  return sharp(Buffer.from(svg)).composite([{ input: a, left: 16, top: 위 }, { input: b, left: W - 512 - 16, top: 위 }]).png().toBuffer();
};
writeFileSync(`${OUT}/${slug}-g${격자}-whole.png`, await 판(await sharp(원본).flatten({ background: "#fff" }).png().toBuffer(), await sharp(맞춤).flatten({ background: "#fff" }).png().toBuffer(), "같은 그림 · 전체"));
writeFileSync(`${OUT}/${slug}-g${격자}-zoom.png`, await 판(await 확대(원본), await 확대(맞춤), "같은 자리 8배 확대"));
console.log(`${OUT}/${slug}-whole.png · ${slug}-zoom.png`);
