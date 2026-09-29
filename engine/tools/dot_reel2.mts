/**
 * **릴스 2판 — 정신 없게** (227회차 09-29, 사장님 "다 해 정신 없게 그리고 핑크새 바탕은 좀 안좋아").
 * 값 0 · 모델 0(대화 화면은 1판에서 찍은 것을 그대로 쓴다 — 다시 돌리면 값이 또 든다).
 *
 *   npx tsx engine/tools/dot_reel2.mts <magicLink>
 *
 * 1판에서 고치는 것:
 *  · **단색 분홍 바탕을 뺀다.** 캐릭터 사진을 크게 흐리게 깔고 그 위에 어둡게 덮는다 —
 *    카드마다 그 캐릭터의 색이 배경이 되어 넘길 때마다 분위기가 바뀐다.
 *  · **컷을 짧게**(3초 → 2~2.4초)하고 장면을 늘린다(6 → 8). 같은 길이에 컷이 늘면 빨라진다.
 *  · **글자가 늦게 튀어 들어온다** — 사진이 먼저 보이고 이름이 뒤따라 붙는다.
 *  · 확대를 1.20 → **1.28배**, 방향도 더 섞는다.
 *
 * 글자를 따로 그리는 이유: 카드에 구워 버리면 처음부터 같이 보여서 "튀어 들어오기" 를 못 한다.
 */
import sharp from "sharp";
import puppeteer from "puppeteer-core";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";

const magic = process.argv[2];
if (!magic) { console.error("사용: <magicLink>"); process.exit(1); }
const BASE = "https://dot-web-production-7e03.up.railway.app";
const OUT = "C:/Users/az518/Desktop/두근도트-영상";
const 칸 = `${OUT}/장면2`;
mkdirSync(칸, { recursive: true });
const W = 1080, H = 1920, FPS = 30;
const 글꼴 = "Malgun Gothic, Pretendard, sans-serif";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ── 화면 찍기 (대화방은 1판 것 재사용) ──────────────────────
const profile = mkdtempSync(join(tmpdir(), "dot-reel2-"));
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true, userDataDir: profile,
  args: ["--no-first-run", "--lang=ko-KR"],
  defaultViewport: { width: 430, height: 932, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const 찍은것: Record<string, Buffer> = {};
try {
  const page = await browser.newPage();
  await page.goto(magic, { waitUntil: "networkidle2", timeout: 60_000 });
  await sleep(2500);
  for (const [키, 길] of [["검색", "/dot/search"], ["피드", "/dot/feed"], ["내창", "/dot/me"]] as [string, string][]) {
    await page.goto(BASE + 길, { waitUntil: "networkidle2", timeout: 60_000 });
    await sleep(2600);
    찍은것[키] = Buffer.from(await page.screenshot({ type: "png" }));
    console.log(`찍음 ${키}`);
  }
} finally {
  await browser.close();
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* 지워지면 됐다 */ }
}
찍은것.대화방 = readFileSync(`${OUT}/_대화방.png`);
console.log("대화방은 1판에서 찍은 것을 쓴다(모델 값 0)");

// ── 캐릭터 카드: 흐린 사진 배경 ─────────────────────────────
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
}
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const { data: cs } = await db.from("dot_characters").select("slug, name, tagline, photos").eq("is_public", true);
const 사람 = ["yuna", "seoha", "rin"]
  .map((s) => (cs ?? []).find((c) => (c as { slug: string }).slug === s))
  .filter(Boolean) as { slug: string; name: string; tagline: string | null; photos: { url: string }[] | null }[];

/** 사진을 화면 가득 흐리게 깔고 어둡게 덮는다 — 단색보다 훨씬 깊어 보인다. */
async function 흐린배경(사진: Buffer): Promise<Buffer> {
  const 깔개 = await sharp(사진).resize(W, H, { fit: "cover", position: "top" }).blur(38).modulate({ brightness: 0.55, saturation: 1.25 }).toBuffer();
  const 덮개 = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><rect width="${W}" height="${H}" fill="#0b0f14" opacity="0.35"/></svg>`);
  return sharp(깔개).composite([{ input: 덮개 }]).png().toBuffer();
}

/** 카드(글자 없음)와 글자층(투명)을 따로 낸다 — 글자를 나중에 튀어 들어오게 하려고. */
async function 캐릭터장면(사진: Buffer, 이름: string, 한마디: string) {
  const 크 = 780;
  const 얼굴 = await sharp(사진).resize(크, 크, { fit: "cover", position: "top" })
    .composite([{ input: Buffer.from(`<svg width="${크}" height="${크}"><rect width="${크}" height="${크}" rx="28" ry="28" fill="#fff"/></svg>`), blend: "dest-in" }])
    .png().toBuffer();
  const 바탕 = await 흐린배경(사진);
  const 카드 = await sharp(바탕).composite([{ input: 얼굴, left: Math.round((W - 크) / 2), top: 390 }]).png().toBuffer();
  const 글자 = await sharp(Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <text x="${W / 2}" y="${H - 430}" font-family="${글꼴}" font-size="92" font-weight="800" fill="#fff" text-anchor="middle"
      style="paint-order:stroke" stroke="#0b0f14" stroke-width="10">${esc(이름)}</text>
    <text x="${W / 2}" y="${H - 320}" font-family="${글꼴}" font-size="50" fill="#ffd9e2" text-anchor="middle"
      style="paint-order:stroke" stroke="#0b0f14" stroke-width="8">${esc(한마디)}</text>
  </svg>`)).png().toBuffer();
  return { 카드, 글자 };
}

/** 폰 화면 — 배경도 그 화면을 흐리게 깐다(검은 여백보다 낫다). */
async function 폰장면(shot: Buffer): Promise<Buffer> {
  const 속W = 880;
  const 작게 = await sharp(shot).resize({ width: 속W }).toBuffer();
  const m = await sharp(작게).metadata();
  const 바탕 = await sharp(shot).resize(W, H, { fit: "cover" }).blur(45).modulate({ brightness: 0.5 }).toBuffer();
  return sharp(바탕)
    .composite([{ input: 작게, left: Math.round((W - 속W) / 2), top: Math.max(0, Math.round((H - (m.height ?? 0)) / 2)) }])
    .png().toBuffer();
}

async function 끝카드(): Promise<Buffer> {
  return sharp(Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${H}" fill="#0b0f14"/>
    <text x="${W / 2}" y="${H / 2 - 150}" font-family="${글꼴}" font-size="72" font-weight="800" fill="#ff5c7a" text-anchor="middle">두근도트</text>
    <text x="${W / 2}" y="${H / 2 - 20}" font-family="${글꼴}" font-size="64" font-weight="700" fill="#fff" text-anchor="middle">베타 테스터 모집 중</text>
    <text x="${W / 2}" y="${H / 2 + 90}" font-family="${글꼴}" font-size="46" fill="#c8d0d8" text-anchor="middle">프로필 링크에서 신청하세요</text>
    <text x="${W / 2}" y="${H / 2 + 180}" font-family="${글꼴}" font-size="38" fill="#7b8590" text-anchor="middle">무료 · 만 14세 이상</text>
  </svg>`)).png().toBuffer();
}

// ── 장면 굽기 ──────────────────────────────────────────────
type 장면 = { 카드: string; 글자?: string; 초: number; 움직임: string; 전환: string };
const 장면들: 장면[] = [];
let n = 0;
const 써두기 = (png: Buffer, 꼬리 = "") => {
  const p = `${칸}/${String(++n).padStart(2, "0")}${꼬리}.png`;
  writeFileSync(p, png); return p;
};

for (let i = 0; i < 사람.length; i++) {
  const c = 사람[i];
  const url = c.photos?.[0]?.url;
  if (!url) continue;
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  const { 카드, 글자 } = await 캐릭터장면(buf, c.name, c.tagline ?? "");
  const p = 써두기(카드);
  const g = 써두기(글자, "-글");
  n--;                                              // 글자는 같은 번호로 묶는다
  장면들.push({ 카드: p, 글자: g, 초: 2.2, 움직임: ["들어가기", "나오기", "오른쪽"][i % 3], 전환: "slideleft" });
}
장면들.push({ 카드: 써두기(await 폰장면(찍은것.검색)), 초: 2.0, 움직임: "아래로", 전환: "slideup" });
장면들.push({ 카드: 써두기(await 폰장면(찍은것.대화방)), 초: 3.0, 움직임: "아래로", 전환: "wiperight" });
장면들.push({ 카드: 써두기(await 폰장면(찍은것.피드)), 초: 2.0, 움직임: "들어가기", 전환: "slideup" });
장면들.push({ 카드: 써두기(await 폰장면(찍은것.내창)), 초: 2.0, 움직임: "아래로", 전환: "fade" });
장면들.push({ 카드: 써두기(await 끝카드()), 초: 2.6, 움직임: "들어가기", 전환: "" });
console.log(`장면 ${장면들.length}개`);

// ── ffmpeg ─────────────────────────────────────────────────
const FF = ffmpegPath as unknown as string;
if (!FF || !existsSync(FF)) { console.error("ffmpeg 을 못 찾았다"); process.exit(1); }
const 겹침 = 0.35;
const 입력: string[] = [], 거르기: string[] = [];
let 번 = 0;
const 번호 = new Map<number, { 카드: number; 글자?: number }>();
장면들.forEach((s, i) => {
  입력.push("-i", s.카드); const c = 번++;
  let g: number | undefined;
  if (s.글자) { 입력.push("-i", s.글자); g = 번++; }
  번호.set(i, { 카드: c, 글자: g });
});

장면들.forEach((s, i) => {
  const { 카드, 글자 } = 번호.get(i)!;
  const d = Math.round(s.초 * FPS);
  const 가운데x = "iw/2-(iw/zoom/2)", 가운데y = "ih/2-(ih/zoom/2)";
  const m = s.움직임 === "들어가기" ? { z: "min(1.0+0.0035*on,1.28)", x: 가운데x, y: 가운데y }
    : s.움직임 === "나오기" ? { z: "max(1.28-0.0035*on,1.0)", x: 가운데x, y: 가운데y }
    : s.움직임 === "오른쪽" ? { z: "1.22", x: `(iw-iw/zoom)*on/${d}`, y: 가운데y }
    : { z: "1.22", x: 가운데x, y: `(ih-ih/zoom)*on/${d}` };
  거르기.push(`[${카드}:v]scale=${Math.round(W * 1.35)}:${Math.round(H * 1.35)},zoompan=z='${m.z}':d=${d}:x='${m.x}':y='${m.y}':s=${W}x${H}:fps=${FPS},setsar=1,format=yuv420p[b${i}]`);
  if (글자 !== undefined) {
    /**
     * **글자 튀어 들어오기.** 0.55초까지는 안 보이고, 그 뒤 0.25초 동안 아래에서 올라온다.
     * `enable` 만 쓰면 뚝 나타나고, y 를 같이 움직여야 "튀어 들어온" 것으로 읽힌다.
     */
    거르기.push(`[${글자}:v]scale=${W}:${H},setsar=1,format=rgba[t${i}]`);
    거르기.push(`[b${i}][t${i}]overlay=x=0:y='if(lt(t,0.55),H,60*max(0,1-(t-0.55)*4))':enable='gte(t,0.55)':format=auto[v${i}]`);
  } else {
    거르기.push(`[b${i}]null[v${i}]`);
  }
});

let 앞 = "[v0]", 누적 = 장면들[0].초;
for (let i = 1; i < 장면들.length; i++) {
  const 방법 = 장면들[i - 1].전환 || "fade";
  const 나옴 = i === 장면들.length - 1 ? "[out]" : `[x${i}]`;
  거르기.push(`${앞}[v${i}]xfade=transition=${방법}:duration=${겹침}:offset=${(누적 - 겹침).toFixed(3)}${나옴}`);
  누적 = 누적 + 장면들[i].초 - 겹침;
  앞 = 나옴;
}

const 결과 = `${OUT}/두근도트-릴스2.mp4`;
console.log(`기대 길이 ${누적.toFixed(1)}초 · 컷 ${장면들.length}개`);
execFileSync(FF, ["-y", ...입력, "-filter_complex", 거르기.join(";"), "-map", "[out]",
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "21",
  "-r", String(FPS), "-movflags", "+faststart", 결과], { stdio: ["ignore", "ignore", "pipe"] });

const ffprobe = (await import("ffprobe-static")).default as unknown as { path: string };
const j = JSON.parse(execFileSync(ffprobe.path, ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", 결과]).toString()) as
  { format: { duration: string; size: string }; streams: { codec_type: string; width?: number; height?: number }[] };
const v = j.streams.find((s) => s.codec_type === "video")!;
const 길이 = Number(j.format.duration);
console.log(`\n**${결과}**`);
console.log(`${v.width}x${v.height} · ${길이.toFixed(1)}초 · ${(Number(j.format.size) / 1048576).toFixed(1)}MB · 소리 ${j.streams.some((s) => s.codec_type === "audio") ? "있음" : "없음"}`);
console.log(Math.abs(길이 - 누적) < 1 ? "**길이 맞음**" : `**길이 틀림**(기대 ${누적.toFixed(1)})`);
