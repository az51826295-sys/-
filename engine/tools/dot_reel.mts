/**
 * **인스타 릴스 만들기** (227회차 09-29, 사장님 "3번으로" · "tts 안 넣고"). 값 0 · 모델 0.
 *
 *   npx tsx engine/tools/dot_reel.mts <magicLink>
 *
 * 짜임새(19초): 캐릭터 셋 소개 9초 → **실제 대화 화면** 4초 → 피드 3초 → 베타 신청 카드 3초.
 *
 * **소리는 안 넣는다**(사장님 결정). 릴스는 인스타 안에서 음악을 붙이는 게 보통이고 그게 노출에도 낫다.
 * TTS 는 값도 들고 도트 감성과도 안 맞는다.
 *
 * **영상 모델을 안 쓴다.** 앱 화면을 진짜로 열어 찍는다 — 만든 걸 보여 주는 게 아니라 **도는 걸** 보여 준다.
 * 그래서 그림값이 0이고, 화면이 바뀌면 다시 돌리기만 하면 된다.
 *
 * 멈춘 그림만 이으면 영상이 아니라 슬라이드다. ffmpeg `zoompan` 으로 **아주 느린 확대**를 넣는다.
 */
import sharp from "sharp";
import puppeteer from "puppeteer-core";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";

const magic = process.argv[2];
const 다시안찍기 = process.argv.includes("--장면그대로");   // 이미 찍은 장면으로 영상만 다시 만든다(대화는 값이 든다)
if (!magic && !다시안찍기) { console.error("사용: <magicLink> | --장면그대로"); process.exit(1); }
const BASE = "https://dot-web-production-7e03.up.railway.app";
const OUT = "C:/Users/az518/Desktop/두근도트-영상";
const 칸 = `${OUT}/장면`;
mkdirSync(칸, { recursive: true });

const W = 1080, H = 1920;                  // 인스타 릴스 세로
const 분홍 = "#ff5c7a", 밤 = "#0b0f14";
const 글꼴 = "Malgun Gothic, Pretendard, sans-serif";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** 폰 화면 한 장을 세로 칸 가운데에 앉힌다. 둘레는 어둡게 — 폰처럼 보인다. */
async function 폰에담기(shot: Buffer, 바탕 = 밤): Promise<Buffer> {
  const 속W = 860;
  const 작게 = await sharp(shot).resize({ width: 속W }).toBuffer();
  const m = await sharp(작게).metadata();
  const top = Math.max(0, Math.round((H - (m.height ?? 0)) / 2));
  return sharp({ create: { width: W, height: H, channels: 4, background: 바탕 } })
    .composite([{ input: 작게, left: Math.round((W - 속W) / 2), top }])
    .png().toBuffer();
}

/** 캐릭터 한 명 카드 — 사진 + 이름 + 첫마디. */
async function 캐릭터카드(사진: Buffer, 이름: string, 한마디: string): Promise<Buffer> {
  const 크 = 760;
  const 얼굴 = await sharp(사진).resize(크, 크, { fit: "cover", position: "top" }).png().toBuffer();
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${H}" fill="${분홍}"/>
    <text x="${W / 2}" y="${H - 470}" font-family="${글꼴}" font-size="84" font-weight="800" fill="#fff" text-anchor="middle">${esc(이름)}</text>
    <text x="${W / 2}" y="${H - 360}" font-family="${글꼴}" font-size="52" fill="#ffe3e9" text-anchor="middle">${esc(한마디)}</text>
  </svg>`;
  return sharp(Buffer.from(svg))
    .composite([{ input: 얼굴, left: Math.round((W - 크) / 2), top: 420 }])
    .png().toBuffer();
}

/** 마지막 카드 — 무엇을 하라는 말 하나만. */
async function 끝카드(): Promise<Buffer> {
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${H}" fill="${분홍}"/>
    <text x="${W / 2}" y="${H / 2 - 120}" font-family="${글꼴}" font-size="76" font-weight="800" fill="#fff" text-anchor="middle">베타 테스터 모집 중</text>
    <text x="${W / 2}" y="${H / 2 + 10}" font-family="${글꼴}" font-size="52" fill="#fff" text-anchor="middle">프로필 링크에서 신청하세요</text>
    <text x="${W / 2}" y="${H / 2 + 120}" font-family="${글꼴}" font-size="44" fill="#ffd3dc" text-anchor="middle">무료 · 만 14세 이상</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

// ── 앱 화면을 진짜로 연다 ───────────────────────────────────
const profile = mkdtempSync(join(tmpdir(), "dot-reel-"));
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

  // ── 대화방: **안내판을 닫고 실제로 몇 마디 주고받는다** ──
  //
  // 첫 판은 방에 들어가자마자 찍었더니 ① 처음 온 사람에게 뜨는 "이 방 쓰는 법" 안내판이
  // 화면을 반쯤 덮었고 ② 말풍선이 한 줄뿐이라 휑했다. 광고에 쓸 화면이 아니다.
  // 말풍선은 **진짜 모델 답**으로 채운다 — 내가 지어낸 대사를 넣으면 그건 제품 화면이 아니라 연출이다.
  await page.goto(BASE + "/dot/yuna", { waitUntil: "networkidle2", timeout: 60_000 });
  await sleep(2500);
  for (const 글 of ["알겠어요", "확인"]) {
    const btn = await page.$$eval("button", (bs, t) => {
      const i = bs.findIndex((b) => (b.textContent ?? "").trim() === t);
      if (i >= 0) (bs[i] as HTMLButtonElement).click();
      return i >= 0;
    }, 글).catch(() => false);
    if (btn) { console.log(`안내판 닫음(${글})`); await sleep(900); }
  }
  const 할말 = ["안녕하세요! 오늘 처음 와 봤어요", "빵 굽는 거 좋아하세요?", "저도 아침에 빵 사러 자주 가요"];
  for (const 말 of 할말) {
    const 칸 = await page.$("textarea, input[type=text]");
    if (!칸) { console.log("입력칸을 못 찾음 — 대화는 건너뛴다"); break; }
    await 칸.click();
    await page.keyboard.type(말, { delay: 12 });
    await page.keyboard.press("Enter");
    await sleep(9000);                                  // 답이 올 때까지
    console.log(`  보냄: ${말}`);
  }
  await sleep(1500);
  찍은것.대화방 = Buffer.from(await page.screenshot({ type: "png" }));
  console.log("찍음 대화방");

  await page.goto(BASE + "/dot/feed", { waitUntil: "networkidle2", timeout: 60_000 });
  await sleep(2600);
  찍은것.피드 = Buffer.from(await page.screenshot({ type: "png" }));
  console.log("찍음 피드");
} finally {
  await browser.close();
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* 지워지면 됐다 */ }
}

// ── 캐릭터 사진은 DB 에서 (그림값 0) ─────────────────────────
const { readFileSync } = await import("node:fs");
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
}
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();
const { data: cs } = await db.from("dot_characters").select("slug, name, tagline, photos").eq("is_public", true);
const 순서 = ["yuna", "seoha", "rin"];
const 사람 = 순서.map((s) => (cs ?? []).find((c) => (c as { slug: string }).slug === s)).filter(Boolean) as
  { slug: string; name: string; tagline: string | null; photos: { url: string }[] | null }[];

// ── 장면 굽기 ──────────────────────────────────────────────
type 장면 = { 파일: string; 초: number };
const 장면들: 장면[] = [];
let n = 0;
const 넣기 = async (png: Buffer, 초: number) => {
  const p = `${칸}/${String(++n).padStart(2, "0")}.png`;
  writeFileSync(p, png);
  장면들.push({ 파일: p, 초 });
};

for (const c of 사람) {
  const url = c.photos?.[0]?.url;
  if (!url) { console.log(`  ${c.name} 사진 없음 — 건너뜀`); continue; }
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  await 넣기(await 캐릭터카드(buf, c.name, c.tagline ?? ""), 3);
}
if (찍은것.대화방) await 넣기(await 폰에담기(찍은것.대화방), 4);
if (찍은것.피드) await 넣기(await 폰에담기(찍은것.피드), 3);
await 넣기(await 끝카드(), 3);
console.log(`장면 ${장면들.length}개 · ${장면들.reduce((a, b) => a + b.초, 0)}초`);

// ── ffmpeg 으로 잇는다 ──────────────────────────────────────
const FF = ffmpegPath as unknown as string;
if (!FF || !existsSync(FF)) { console.error("ffmpeg 을 못 찾았다"); process.exit(1); }
const FPS = 30;
// 아주 느린 확대(zoompan) — 멈춘 그림만 이으면 슬라이드지 영상이 아니다.
const 입력: string[] = [], 거르기: string[] = [];
장면들.forEach((s, i) => {
  /**
   * **`-loop 1 -t` 를 쓰면 안 된다.**
   *
   * 그러면 입력이 초당 25장을 내놓고, `zoompan` 은 **들어온 장마다** `d` 칸씩 늘린다 —
   * 19초짜리가 **1525초(25분)** 로 나왔다(자가 잡았다). 그림은 **한 장만** 넣고
   * 길이는 `d` 로만 정한다.
   */
  입력.push("-i", s.파일);
  const 총칸 = s.초 * FPS;
  // 2배(2160x3840)로 키워 zoompan 을 돌렸더니 **10분이 지나도 안 끝났다.** 1.25배면 확대해도
  // 픽셀이 안 뭉개지고 훨씬 빠르다 — 느린 것을 참지 말고 크기를 줄인다.
  거르기.push(
    `[${i}:v]scale=${Math.round(W * 1.25)}:${Math.round(H * 1.25)},zoompan=z='min(1.0+0.0008*on,1.08)':d=${총칸}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${W}x${H}:fps=${FPS},setsar=1[v${i}]`,
  );
});
const 이음 = 장면들.map((_, i) => `[v${i}]`).join("") + `concat=n=${장면들.length}:v=1:a=0[out]`;
const 결과 = `${OUT}/두근도트-릴스.mp4`;
execFileSync(FF, [
  "-y", ...입력,
  "-filter_complex", [...거르기, 이음].join(";"),
  "-map", "[out]",
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "22",
  "-r", String(FPS), "-movflags", "+faststart", 결과,
], { stdio: ["ignore", "ignore", "pipe"] });

// ── 만든 것을 잰다 ─────────────────────────────────────────
const ffprobe = (await import("ffprobe-static")).default as unknown as { path: string };
const 잼 = JSON.parse(execFileSync(ffprobe.path, [
  "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", 결과,
]).toString()) as { format: { duration: string; size: string }; streams: { codec_type: string; width?: number; height?: number }[] };
const v = 잼.streams.find((s) => s.codec_type === "video");
const 소리 = 잼.streams.some((s) => s.codec_type === "audio");
console.log(`\n**${결과}**`);
console.log(`${v?.width}x${v?.height} · ${Number(잼.format.duration).toFixed(1)}초 · ${(Number(잼.format.size) / 1024 / 1024).toFixed(1)}MB · 소리 ${소리 ? "있음" : "없음(의도한 대로)"}`);
console.log(v?.width === W && v?.height === H ? "세로 9:16 맞음" : "**세로 비율이 틀렸다**");
