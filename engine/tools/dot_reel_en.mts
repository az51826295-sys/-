/**
 * **영어 릴스** (11-23, 사장님 "해 · 마지막에 링크 넣고 · 소리 빼, 내가 넣을게").
 *   npx tsx engine/tools/dot_reel_en.mts            → 바탕화면/두근도트-영상/dot-reel-en.mp4
 *   npx tsx engine/tools/dot_reel_en.mts --장면그대로   → 찍어 둔 장면으로 영상만 다시
 *
 * dot_reel.mts(09-29, 한국어·베타 신청 끝카드)를 영어가 기본(11-22)·새 주소(dugeundot.com)에 맞춰 다시 짠 것.
 * 짜임새(약 17초): 캐릭터 셋 소개 6초 → **실제 대화, 답이 올 때마다 한 장씩**(표정이 바뀌는 게 이 앱의 전부다) → 피드 2초 → 끝카드(주소) 3초.
 *
 * - **소리 없음**(사장님이 직접 넣는다). 만든 뒤 ffprobe 로 오디오 줄이 없는지 잰다.
 * - **영상 모델 안 씀** — 앱을 진짜로 열어 찍는다. 손님(가입 없이)으로 들어간다 — 처음 온 사람이 보는 그대로.
 * - 말풍선은 **진짜 모델 답**이다. 대사를 지어 넣으면 제품 화면이 아니라 연출이다.
 */
import sharp from "sharp";
import puppeteer from "puppeteer-core";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";

const 다시안찍기 = process.argv.includes("--장면그대로");
const BASE = (process.env.DOT_SITE ?? "https://dugeundot.com").replace(/\/$/, "");
const 주소글 = "dugeundot.com";
const OUT = "C:/Users/az518/Desktop/두근도트-영상";
const 칸 = `${OUT}/장면-en`;
mkdirSync(칸, { recursive: true });

const W = 1080, H = 1920;
const 분홍 = "#ff5c7a", 밤 = "#0b0f14";
const 글꼴 = "Arial, Helvetica, sans-serif";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function 폰에담기(shot: Buffer): Promise<Buffer> {
  const 속W = 900;
  // 폰 화면(430×932, 2배)은 너비만 맞추면 1951px 로 세로칸(1920)을 넘는다 — 둘 다 안에 들게.
  const 작게 = await sharp(shot).resize({ width: 속W, height: H - 80, fit: "inside" }).toBuffer();
  const m = await sharp(작게).metadata();
  const top = Math.max(0, Math.round((H - (m.height ?? 0)) / 2));
  return sharp({ create: { width: W, height: H, channels: 4, background: 밤 } })
    .composite([{ input: 작게, left: Math.round((W - (m.width ?? 속W)) / 2), top }]).png().toBuffer();
}

async function 캐릭터카드(사진: Buffer, 이름: string, 한마디: string): Promise<Buffer> {
  const 크 = 760;
  const 얼굴 = await sharp(사진).resize(크, 크, { fit: "cover", position: "top", kernel: "nearest" }).png().toBuffer();
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${H}" fill="${분홍}"/>
    <text x="${W / 2}" y="${H - 470}" font-family="${글꼴}" font-size="88" font-weight="800" fill="#fff" text-anchor="middle">${esc(이름)}</text>
    <text x="${W / 2}" y="${H - 360}" font-family="${글꼴}" font-size="50" fill="#ffe3e9" text-anchor="middle">${esc(한마디)}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).composite([{ input: 얼굴, left: Math.round((W - 크) / 2), top: 420 }]).png().toBuffer();
}

/** 끝카드 — 이미 정한 소개 한 줄(lang.ts feed_intro_*) + 주소. 새 문구를 지어내지 않는다. */
async function 끝카드(아이콘: Buffer): Promise<Buffer> {
  const 크 = 300;
  const ic = await sharp(아이콘).resize(크, 크, { kernel: "nearest" }).png().toBuffer();
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${H}" fill="${분홍}"/>
    <text x="${W / 2}" y="${H / 2 + 60}" font-family="${글꼴}" font-size="64" font-weight="800" fill="#fff" text-anchor="middle">Chat with pixel characters,</text>
    <text x="${W / 2}" y="${H / 2 + 145}" font-family="${글꼴}" font-size="64" font-weight="800" fill="#fff" text-anchor="middle">like texting a friend</text>
    <text x="${W / 2}" y="${H / 2 + 230}" font-family="${글꼴}" font-size="44" fill="#ffe3e9" text-anchor="middle">No sign-up</text>
    <rect x="${W / 2 - 330}" y="${H / 2 + 320}" width="660" height="130" rx="65" fill="#fff"/>
    <text x="${W / 2}" y="${H / 2 + 405}" font-family="${글꼴}" font-size="64" font-weight="800" fill="${분홍}" text-anchor="middle">${주소글}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).composite([{ input: ic, left: Math.round((W - 크) / 2), top: H / 2 - 420 }]).png().toBuffer();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const 대화장들: Buffer[] = [];
let 피드: Buffer | null = null;

if (!다시안찍기) {
  const profile = mkdtempSync(join(tmpdir(), "dot-reel-en-"));
  const browser = await puppeteer.launch({
    executablePath: process.env.DOT_BROWSER ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true, userDataDir: profile, args: ["--no-first-run", "--lang=en-US"],
    defaultViewport: { width: 430, height: 932, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  });
  try {
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ "accept-language": "en-US,en;q=0.9" });
    const 닫기 = async () => {
      for (const 글 of ["Got it", "Later"]) {
        const ok = await page.$$eval("button", (bs, t) => {
          const b = bs.find((x) => (x.textContent ?? "").trim() === t) as HTMLButtonElement | undefined;
          if (b) b.click();
          return !!b;
        }, 글).catch(() => false);
        if (ok) { console.log(`  닫음(${글})`); await sleep(800); }
      }
    };
    await page.goto(BASE + "/dot/yuna", { waitUntil: "networkidle2", timeout: 60_000 });
    await sleep(3000);
    await 닫기();
    // 11-23 첫 판: 처음 온 손님은 하트가 0 이라 "Check in for 5 hearts" 판이 입력을 막았다 — 세 장면이 다 그 판이었다.
    // 처음 온 사람이 실제로 하는 그대로 출석을 누르고 시작한다(돈 0, 앱의 무료 하트).
    const 출석 = await page.$$eval("button", (bs) => {
      const b = bs.find((x) => /^(Check in|Get \d+ hearts)/i.test((x.textContent ?? "").trim())) as HTMLButtonElement | undefined;
      if (b) b.click();
      return b?.textContent ?? "";
    }).catch(() => "");
    if (출석) { console.log(`  출석(${출석.trim()})`); await sleep(2500); await 닫기(); }
    for (const 말 of ["Hi! First time here", "Do you like baking bread?", "I just failed my test today..."]) {
      const 입력 = await page.$("textarea, input[type=text]");
      if (!입력) { console.log("입력칸을 못 찾음 — 대화 건너뜀"); break; }
      await 입력.click();
      await page.keyboard.type(말, { delay: 12 });
      await page.keyboard.press("Enter");
      await sleep(10_000);
      await 닫기();
      대화장들.push(Buffer.from(await page.screenshot({ type: "png" })));
      console.log(`  보냄·찍음: ${말}`);
    }
    await page.goto(BASE + "/dot/feed", { waitUntil: "networkidle2", timeout: 60_000 });
    await sleep(2600);
    await 닫기();
    피드 = Buffer.from(await page.screenshot({ type: "png" }));
  } finally {
    await browser.close();
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* 됐다 */ }
  }
}

// ── 캐릭터 사진·영어 소개는 DB 에서 ──
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^"|"$/g, "");
}
const { createServiceClient } = await import("../../src/lib/supabase/service");
const { shownName } = await import("../../src/lib/dot/lang");
const { data: cs } = await createServiceClient().from("dot_characters").select("slug, name, tagline, en, photos").eq("is_public", true);
type C = { slug: string; name: string; tagline: string | null; en: { tagline?: string } | null; photos: { url: string }[] | null };
const 사람 = ["yuna", "seoha", "rin"].map((s) => (cs as C[] ?? []).find((c) => c.slug === s)).filter(Boolean) as C[];

type 장면 = { 파일: string; 초: number };
const 장면들: 장면[] = [];
let n = 0;
const 넣기 = async (png: Buffer, 초: number) => { const p = `${칸}/${String(++n).padStart(2, "0")}.png`; writeFileSync(p, png); 장면들.push({ 파일: p, 초 }); };

if (다시안찍기) {
  for (const f of readdirSync(칸).filter((f) => f.endsWith(".png")).sort()) 장면들.push({ 파일: `${칸}/${f}`, 초: Number(readFileSync(`${칸}/${f}.초`, "utf8")) });
} else {
  for (const f of readdirSync(칸)) rmSync(`${칸}/${f}`);
  for (const c of 사람) {
    const url = c.photos?.[0]?.url;
    if (!url) continue;
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    await 넣기(await 캐릭터카드(buf, shownName(c.slug, c.name, "en"), c.en?.tagline ?? ""), 2);
  }
  for (const s of 대화장들) await 넣기(await 폰에담기(s), 2.5);
  if (피드) await 넣기(await 폰에담기(피드), 2);
  await 넣기(await 끝카드(readFileSync("public/dot-icon-512.png")), 3.5);
  for (const s of 장면들) writeFileSync(`${s.파일}.초`, String(s.초));
}
console.log(`장면 ${장면들.length}개 · ${장면들.reduce((a, b) => a + b.초, 0)}초`);

// ── ffmpeg (dot_reel.mts 와 같은 길: 그림 한 장 + zoompan d 로 길이) ──
const FF = ffmpegPath as unknown as string;
if (!FF || !existsSync(FF)) { console.error("ffmpeg 을 못 찾았다"); process.exit(1); }
const FPS = 30;
const 입력: string[] = [], 거르기: string[] = [];
장면들.forEach((s, i) => {
  입력.push("-i", s.파일);
  거르기.push(`[${i}:v]scale=${Math.round(W * 1.25)}:${Math.round(H * 1.25)},zoompan=z='min(1.0+0.0008*on,1.08)':d=${Math.round(s.초 * FPS)}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${W}x${H}:fps=${FPS},setsar=1[v${i}]`);
});
const 결과 = `${OUT}/dot-reel-en.mp4`;
execFileSync(FF, ["-y", ...입력, "-filter_complex", [...거르기, 장면들.map((_, i) => `[v${i}]`).join("") + `concat=n=${장면들.length}:v=1:a=0[out]`].join(";"),
  "-map", "[out]", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "22", "-r", String(FPS), "-movflags", "+faststart", 결과],
  { stdio: ["ignore", "ignore", "pipe"] });

const ffprobe = (await import("ffprobe-static")).default as unknown as { path: string };
const 잼 = JSON.parse(execFileSync(ffprobe.path, ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", 결과]).toString()) as
  { format: { duration: string; size: string }; streams: { codec_type: string; width?: number; height?: number }[] };
const v = 잼.streams.find((s) => s.codec_type === "video");
const 소리 = 잼.streams.some((s) => s.codec_type === "audio");
console.log(`\n${결과}\n${v?.width}x${v?.height} · ${Number(잼.format.duration).toFixed(1)}초 · ${(Number(잼.format.size) / 1024 / 1024).toFixed(1)}MB · 소리 ${소리 ? "**있음 — 틀렸다**" : "없음(의도대로)"}`);
