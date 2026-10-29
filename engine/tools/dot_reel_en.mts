/**
 * **영어판 인스타 릴스** (10-29, 사장님 "두근도트 인스타 올릴 영상만들어 영어로"). 값 0 · 모델 0(그림).
 *
 *   npx tsx engine/tools/dot_reel_en.mts                # 앱을 열어 찍고 영상까지
 *   npx tsx engine/tools/dot_reel_en.mts --장면그대로     # 찍은 것으로 영상만 다시
 *
 * ## 재료가 맞아야 광고가 산다
 *
 * 영어판에서 새로 생긴 것은 **캐릭터가 영어로 말한다** 는 것 하나다. 그러면 광고의 알맹이는
 * 내가 지어낸 영어 문구가 아니라 **앱이 실제로 돌려준 영어 한 줄**이어야 한다.
 * 그래서 훅(첫 2초)에 쓰는 글은 지금 서버에서 받은 답에서 **골라 오기만** 한다
 * ([[rookery-has-no-video-model]] 의 거울: 연출이 아니라 재료가 문제였다).
 *
 * ## 소리는 안 넣는다
 * 09-29 사장님 결정. 릴스는 인스타 안에서 음악을 얹는 게 노출에 낫고, TTS 는 도트 감성과 안 맞는다.
 * 소리를 끄고 보니까 **이름·한마디는 글자로** 떠 있어야 한다.
 *
 * ## 한글이 한 자라도 보이면 안 된다
 * 영어 게시물에 한국어 화면이 섞이면 "번역 안 된 앱" 으로 보인다. 그래서 찍는 순간
 * `document.body.innerText` 의 **한글 글자 수를 세고**, 0 이 아니면 어긋남으로 적는다.
 * 10-29 첫 판에서 이 자가 96자를 잡아냈다(방 안내판·남은 횟수가 한국어였다).
 */
import sharp from "sharp";
import puppeteer from "puppeteer-core";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";

const BASE = "https://dot-web-production-7e03.up.railway.app";
/** 누구 편인가. 한 명씩 돌리면 **올릴 것이 여러 편**이 된다(캐릭터마다 결이 다르다). */
const SLUG = (process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "doyun").toLowerCase();
const 이름 = SLUG.charAt(0).toUpperCase() + SLUG.slice(1);
const 나온칸 = `C:/Users/az518/Desktop/두근도트-영상/영어/${SLUG}`;
const 장면칸 = `${나온칸}/장면`;
const 찍은칸 = `${나온칸}/찍은것`;
const FF = ffmpegPath as unknown as string;
if (!FF || !existsSync(FF)) { console.error("ffmpeg 을 못 찾았다"); process.exit(1); }
mkdirSync(장면칸, { recursive: true });
mkdirSync(찍은칸, { recursive: true });

const 다시안찍기 = process.argv.includes("--장면그대로");
const W = 1080, H = 1920, FPS = 30, 겹침 = 0.25;
/** 영어 글은 영어 글꼴로. 한글 글꼴로 영어를 쓰면 자간이 어색하다. */
const 글꼴 = "Segoe UI, Arial, Helvetica, sans-serif";
const 분홍 = "#ff5c7a", 밤 = "#0b0f14";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const 글자 = (x: number, y: number, 글: string, 크기: number, 색: string, 굵기 = 800, 테 = 12) =>
  `<text x="${x}" y="${y}" font-family="${글꼴}" font-size="${크기}" font-weight="${굵기}" fill="${색}" text-anchor="middle"
     style="paint-order:stroke" stroke="#0b0f14" stroke-width="${테}">${esc(글)}</text>`;

/** 긴 문장을 폭에 맞게 줄로 가른다 — 한 줄로 두면 글자가 작아져 못 읽는다. */
function 줄나누기(글: string, 한줄: number): string[] {
  const 줄: string[] = [];
  let 지금 = "";
  for (const w of 글.split(/\s+/)) {
    if ((지금 + " " + w).trim().length > 한줄 && 지금) { 줄.push(지금); 지금 = w; }
    else 지금 = (지금 + " " + w).trim();
  }
  if (지금) 줄.push(지금);
  return 줄;
}

const 한글수 = (s: string) => (s.match(/[\uac00-\ud7a3]/g) ?? []).length;

// ── ① 앱을 영어로 열어 **진짜 대화**를 찍는다 ────────────────────────
type 찍힘 = { 훅: string; 한글: number; 영문: number; 보냄: string[]; 말풍선?: string[] };
let 찍힘: 찍힘;

if (다시안찍기) {
  찍힘 = JSON.parse(readFileSync(`${찍은칸}/찍힘.json`, "utf8")) as 찍힘;
  console.log(`찍은 것 그대로 — 훅 "${찍힘.훅}"`);
} else {
  const profile = mkdtempSync(join(tmpdir(), "dot-reel-en-"));
  const browser = await puppeteer.launch({
    executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    headless: true, userDataDir: profile,
    args: ["--no-first-run", "--lang=en-US"],
    defaultViewport: { width: 430, height: 932, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  });
  const 쉬기 = (ms: number) => new Promise((r) => setTimeout(r, ms));
  try {
    const page = await browser.newPage();
    /* 쿠키가 서버가 읽을 수 있는 유일한 자리다 — localStorage 만 두면 서버가 그린 글은 한국어로 남는다. */
    await page.setCookie({ name: "dot_lang", value: "en", domain: new URL(BASE).hostname, path: "/" });
    await page.goto(`${BASE}/dot/${SLUG}`, { waitUntil: "networkidle2", timeout: 90_000 });
    await 쉬기(4000);

    /* 처음 온 사람에게 뜨는 안내판을 닫는다 — 화면을 반쯤 덮는다. */
    for (const 글 of ["Got it", "알겠어요"]) {
      const 눌렀나 = await page.$$eval("button", (bs, t) => {
        const i = bs.findIndex((b) => (b.textContent ?? "").trim() === t);
        if (i >= 0) (bs[i] as HTMLButtonElement).click();
        return i >= 0;
      }, 글).catch(() => false);
      if (눌렀나) { console.log(`안내판 닫음(${글})`); await 쉬기(900); }
    }

    /** 영어로 말을 건다. **내가 대사를 지어 넣는 게 아니라** 앱이 답한 것을 쓴다. */
    /* 10-29: 첫마디가 **그 사람에게 맞아야** 대화가 산다. "still at the office?" 는 도윤에게만 맞는 말이다.
       사람마다 따로 적되, **답은 손대지 않는다** — 광고에 쓰는 건 앱이 돌려준 쪽이다. */
    const 첫마디: Record<string, string[]> = {
      doyun: ["hey, still at the office?", "that sounds rough. did you eat anything?", "take a break. i will stay here"],
      seoha: ["hey, how was school today?", "that bad huh. want to talk about it?", "i'm around if you need me"],
      rin: ["hey, you busy?", "i had a rough day today", "thanks for listening"],
      yuna: ["hi! how was your day?", "mine was long. yours?", "glad i caught you"],
      nabi: ["are you streaming today?", "how many people showed up?", "your voice okay after all that?"],
      haru: ["hey, want to go for a walk?", "the weather is nice out", "let's go tomorrow then"],
      yeonu: ["hey, what are you making?", "that smells good from here", "save me some"],
    };
    const 보냄 = 첫마디[SLUG] ?? ["hey, what are you up to?", "rough day today", "i'm here if you want to talk"];
    const 답 = [];
    for (const [i, 말] of 보냄.entries()) {
      const 칸 = await page.$("textarea, input[type=text]");
      if (!칸) { console.log("입력칸을 못 찾음"); break; }
      await 칸.click();
      await page.keyboard.type(말, { delay: 10 });
      await page.keyboard.press("Enter");
      await 쉬기(11_000);
      console.log(`  보냄: ${말}`);
      if (i === 0) { await 쉬기(600); writeFileSync(`${찍은칸}/대화1.png`, Buffer.from(await page.screenshot({ type: "png" }))); }
    }
    await 쉬기(1500);
    writeFileSync(`${찍은칸}/대화2.png`, Buffer.from(await page.screenshot({ type: "png" })));

    const 본 = await page.evaluate(() => {
      const t = document.body.innerText ?? "";
      /* 상대 말풍선만 — 내가 보낸 말을 훅에 쓰면 그건 앱의 말이 아니다. */
      const 말풍선 = [...document.querySelectorAll(".kk-bubble.them:not(.typing)")]
        .map((e) => (e.textContent ?? "").trim().replace(/▍$/, ""))
        .filter((s) => s.length > 8 && !/^[.● ]+$/.test(s));
      return { 글: t, 말풍선, 한글: (t.match(/[\uac00-\ud7a3]/g) ?? []).length, 영문: (t.match(/[A-Za-z]/g) ?? []).length };
    });
    /* 훅은 **제일 먼저 한 말**이다. 10-29 첫 판은 "제일 짧은 것" 으로 골랐더니
       "Lunch break soon for you?" 가 뽑혔다 — 틀린 말은 아니지만 이 캐릭터를 하나도 안 보여 준다.
       고르는 자는 길이와 차례뿐이다. 더 고르기 시작하면 재료가 아니라 내 연출이 된다. */
    const 후보 = (본.말풍선 as string[]).filter((s) => s.length >= 22 && s.length <= 90 && 한글수(s) === 0);
    찍힘 = { 훅: 후보[0] ?? "", 한글: 본.한글, 영문: 본.영문, 보냄, 말풍선: 본.말풍선 as string[] };
    writeFileSync(`${찍은칸}/찍힘.json`, JSON.stringify(찍힘, null, 1));
    console.log(`\n받은 말풍선 ${(본.말풍선 as string[]).length}개 · 화면 한글 ${본.한글}자 · 영문 ${본.영문}자`);
    console.log(`훅: "${찍힘.훅}"`);
  } finally {
    await browser.close();
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* 지워지면 됐다 */ }
  }
}

// ── ② 장면 굽기 ────────────────────────────────────────────────
type 컷 = { 파일: string; 초: number; 움직임: "들어가기" | "나오기" | "훑기"; 전환: string };
const 컷들: 컷[] = [];
let n = 0;
const 쓰기 = (png: Buffer) => { const p = `${장면칸}/${String(++n).padStart(2, "0")}.png`; writeFileSync(p, png); return p; };

/** 폰 화면 한 장을 세로 칸 가운데에 앉힌다. */
async function 폰에담기(파일: string, 바탕 = 밤): Promise<Buffer> {
  const 속W = 880;
  const 작게 = await sharp(파일).resize({ width: 속W }).toBuffer();
  const m = await sharp(작게).metadata();
  const top = Math.max(0, Math.round((H - (m.height ?? 0)) / 2));
  return sharp({ create: { width: W, height: H, channels: 4, background: 바탕 } })
    .composite([{ input: 작게, left: Math.round((W - 속W) / 2), top }]).png().toBuffer();
}

// ① 훅 — 앱이 실제로 한 말. 뒤에 도윤 사진을 크게 깔고 어둡게 덮는다.
const 훅글 = process.env.DOT_HOOK || 찍힘.훅 || "…Mm. You're here? I'm working overtime right now.";
{
  const 사진 = `public/dot-sprites/${SLUG}/photo/1.png`;
  const 바닥 = existsSync(사진)
    ? await sharp(사진).resize(W, H, { fit: "cover", position: "top" }).modulate({ brightness: 0.42 }).blur(9).png().toBuffer()
    : await sharp({ create: { width: W, height: H, channels: 4, background: 밤 } }).png().toBuffer();
  /* 10-29 첫 판에서 **훅의 첫 줄이 화면 밖으로 잘렸다**(92px × 19자). 확대가 1.2배까지 가니
     실제로 보이는 폭은 1080/1.2 = 900px 이다. 그래서 글자 크기를 **제일 긴 줄에 맞춰 줄인다** —
     눈으로 보고 고르면 다음에 긴 말이 오면 또 잘린다. */
  const 줄 = 줄나누기(훅글, 20);
  const 제일긴줄 = Math.max(...줄.map((l) => l.length));
  const 글크기 = Math.max(52, Math.min(92, Math.floor(780 / (제일긴줄 * 0.52))));
  const 시작 = H / 2 - ((줄.length - 1) * 글크기 * 1.25) / 2 - 40;
  컷들.push({
    파일: 쓰기(await sharp(바닥).composite([{ input: Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      ${줄.map((l, i) => 글자(W / 2, 시작 + i * 글크기 * 1.25, l, 글크기, "#ffffff")).join("")}
      ${글자(W / 2, H / 2 + 300, `— ${이름}, in the app, just now`, 42, "#ffd9e2", 600, 8)}
    </svg>`) }]).png().toBuffer()),
    초: 2.4, 움직임: "들어가기", 전환: "fade",
  });
}

// ② 진짜 화면 두 장 — 대화가 늘어나는 게 보인다
for (const [i, f] of ["대화1.png", "대화2.png"].entries()) {
  const p = `${찍은칸}/${f}`;
  if (!existsSync(p)) { console.log(`${f} 이 없다 — 건너뜀`); continue; }
  컷들.push({ 파일: 쓰기(await 폰에담기(p)), 초: i === 0 ? 2.6 : 3.0, 움직임: "훑기", 전환: i === 0 ? "slideup" : "fade" });
}

/** 전신 스프라이트 한 장을 화면 가운데에. */
async function 몸칸(slug: string, 표정: string, 바탕: string, 글svg: string): Promise<Buffer> {
  const f = `public/dot-sprites/${slug}/${표정}.png`;
  const 크 = 900;
  const 그림 = await sharp(f).resize(크, 크, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: "nearest" }).png().toBuffer();
  const 바닥 = await sharp({ create: { width: W, height: H, channels: 4, background: 바탕 } }).png().toBuffer();
  return sharp(바닥)
    .composite([{ input: 그림, left: Math.round((W - 크) / 2), top: Math.round((H - 크) / 2) - 140 },
                { input: Buffer.from(글svg) }]).png().toBuffer();
}

// ③ 친해지면 표정이 바뀐다 — 이 앱의 알맹이
컷들.push({
  파일: 쓰기(await 몸칸(SLUG, "neutral", "#1d2430", `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    ${글자(W / 2, H - 430, "♥♡♡♡♡", 86, "#ff5c7a")}
    ${글자(W / 2, H - 320, "The voice and the face", 52, "#ffffff", 700, 10)}
    ${글자(W / 2, H - 250, "change as you get closer", 52, "#ffffff", 700, 10)}
  </svg>`)),
  초: 1.9, 움직임: "들어가기", 전환: "fadewhite",
});
컷들.push({
  파일: 쓰기(await 몸칸(SLUG, "happy", "#2b2135", `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    ${글자(W / 2, H - 430, "♥♥♥♡♡", 86, "#ff5c7a")}
  </svg>`)),
  초: 1.4, 움직임: "나오기", 전환: "slideleft",
});

// ④ 줄 세우기 — 몇 명인지 한눈에
{
  const 식구 = ["doyun", "yuna", "seoha", "rin", "nabi", "haru", "yeonu"].filter((s) => existsSync(`public/dot-sprites/${s}/face/neutral.png`));
  const 칸 = 300, 줄수 = Math.ceil(식구.length / 3);
  const 겹칠: sharp.OverlayOptions[] = [];
  for (const [i, s] of 식구.entries()) {
    const r = Math.floor(i / 3), c = i % 3;
    const 이번줄 = Math.min(3, 식구.length - r * 3);
    겹칠.push({
      input: await sharp(`public/dot-sprites/${s}/face/neutral.png`).resize(칸 - 24, 칸 - 24, { fit: "cover", kernel: "nearest" }).png().toBuffer(),
      left: Math.round(W / 2 - (이번줄 * 칸) / 2 + c * 칸 + 12),
      top: Math.round(H / 2 - (줄수 * 칸) / 2 + r * 칸 + 12) - 60,
    });
  }
  const 바닥 = await sharp({ create: { width: W, height: H, channels: 4, background: 밤 } }).png().toBuffer();
  컷들.push({
    파일: 쓰기(await sharp(바닥).composite([...겹칠, { input: Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      ${글자(W / 2, H / 2 + (줄수 * 칸) / 2 + 60, `${식구.length} people to talk to`, 76, "#ffffff")}
      ${글자(W / 2, H / 2 + (줄수 * 칸) / 2 + 150, "they post, they text first", 46, "#c8d0d8", 600, 8)}
    </svg>`) }]).png().toBuffer()),
    초: 2.3, 움직임: "들어가기", 전환: "fade",
  });
}

// ⑤ 끝카드 — 할 일 하나만. 숫자는 코드에서 읽은 것만 적는다(하루 10번).
{
  const { FREE_TURNS_PER_DAY } = await import("../../src/lib/dot/bond");
  컷들.push({
    파일: 쓰기(await sharp(Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${W}" height="${H}" fill="${분홍}"/>
      ${글자(W / 2, H / 2 - 200, "Dot", 170, "#ffffff", 900, 0)}
      ${글자(W / 2, H / 2 - 70, "now in English", 68, "#fff0f3", 700, 0)}
      ${글자(W / 2, H / 2 + 90, `${FREE_TURNS_PER_DAY} free messages a day`, 50, "#ffffff", 700, 0)}
      ${글자(W / 2, H / 2 + 165, "no install · opens in the browser", 44, "#ffe3e9", 600, 0)}
      ${글자(W / 2, H / 2 + 330, "link in bio", 62, "#ffffff", 800, 0)}
    </svg>`)).png().toBuffer()),
    초: 2.8, 움직임: "들어가기", 전환: "",
  });
}

// ── ③ 이어 붙이기 ──────────────────────────────────────────────
const 입력: string[] = [], 거르기: string[] = [];
const 큰W = Math.round(W * 1.1), 큰H = Math.round(H * 1.1);
컷들.forEach((k, i) => {
  입력.push("-i", k.파일);
  const d = Math.round(k.초 * FPS), cx = "iw/2-(iw/zoom/2)", cy = "ih/2-(ih/zoom/2)";
  /* 훑기: 말풍선이 위에서 아래로 흐르는 것처럼 — 그 화면이 무엇인지 말해 주는 움직임이다. */
  const m = k.움직임 === "훑기" ? { z: "1.14", x: cx, y: `ih/2-(ih/zoom/2)+${Math.round(H * 0.06)}*on/${d}` }
    : k.움직임 === "들어가기" ? { z: "min(1.0+0.003*on,1.2)", x: cx, y: cy }
    : { z: "max(1.2-0.003*on,1.0)", x: cx, y: cy };
  /* 대화 화면은 **흔들지 않는다** — 읽어야 하는 화면이 떨면 무엇을 파는지 안 보인다. */
  const 흔들 = k.움직임 === "훑기" ? `crop=${W}:${H}:x='(iw-${W})/2':y='(ih-${H})/2'`
    : `crop=${W}:${H}:x='(iw-${W})/2+5*sin(t*25)':y='(ih-${H})/2+5*cos(t*21)'`;
  거르기.push(`[${i}:v]scale=${Math.round(W * 1.3)}:${Math.round(H * 1.3)},zoompan=z='${m.z}':d=${d}:x='${m.x}':y='${m.y}':s=${큰W}x${큰H}:fps=${FPS},` +
    `${흔들},setsar=1,format=yuv420p[v${i}]`);
});
let 앞 = "[v0]", 누적 = 컷들[0].초;
for (let i = 1; i < 컷들.length; i++) {
  const 나옴 = i === 컷들.length - 1 ? "[out]" : `[x${i}]`;
  거르기.push(`${앞}[v${i}]xfade=transition=${컷들[i - 1].전환 || "fade"}:duration=${겹침}:offset=${(누적 - 겹침).toFixed(3)}${나옴}`);
  누적 += 컷들[i].초 - 겹침; 앞 = 나옴;
}

const 결과 = `${나온칸}/dot-en-${SLUG}.mp4`;
execFileSync(FF, ["-y", ...입력, "-filter_complex", 거르기.join(";"), "-map", "[out]",
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "21", "-r", String(FPS), "-movflags", "+faststart", 결과],
  { stdio: ["ignore", "ignore", "pipe"] });

// ── ④ 재기 ─────────────────────────────────────────────────────
const ffprobe = (await import("ffprobe-static")).default as unknown as { path: string };
const j = JSON.parse(execFileSync(ffprobe.path, ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", 결과]).toString()) as
  { format: { duration: string; size: string }; streams: { width?: number; height?: number }[] };
const 길이 = Number(j.format.duration), 영상 = j.streams.find((s) => s.width);
const 잼: [string, boolean | null, string][] = [
  ["길이가 기대와 맞나", Math.abs(길이 - 누적) < 1, `${길이.toFixed(1)}초 (기대 ${누적.toFixed(1)})`],
  ["릴스 길이(8~20초)", 길이 >= 8 && 길이 <= 20, `${길이.toFixed(1)}초`],
  ["세로 9:16", 영상?.width === W && 영상?.height === H, `${영상?.width}x${영상?.height}`],
  ["끝카드가 2.5초 넘나", 컷들[컷들.length - 1].초 >= 2.5, `${컷들[컷들.length - 1].초}초`],
  ["20MB 아래", Number(j.format.size) / 1048576 < 20, `${(Number(j.format.size) / 1048576).toFixed(1)}MB`],
  ["훅이 **앱이 한 말**인가", 찍힘.훅.length > 0, 찍힘.훅 ? `"${찍힘.훅}"` : "못 받아서 미리 적어 둔 말을 씀"],
  ["앱 화면에 한글이 없나", 다시안찍기 ? null : 찍힘.한글 === 0, `${찍힘.한글}자`],
  ["내가 쓴 글에 한글이 없나", 컷들.length > 0 && 한글수(훅글) === 0, `훅 한글 ${한글수(훅글)}자`],
];
console.log();
for (const [이름, ok, 값] of 잼) console.log(`${ok === null ? "못 잼 " : ok ? "맞음  " : "**어긋남**"} ${이름} — ${값}`);
const 나쁨 = 잼.filter((x) => x[1] === false).length;
console.log(`\n${잼.filter((x) => x[1] === true).length}/${잼.length} → ${결과}`);
if (나쁨) process.exitCode = 1;
