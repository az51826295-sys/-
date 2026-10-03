/**
 * **새 캐릭터 홍보 릴스** (228회차 10-03, 사장님 "새캐릭터 출시 하고 홍보영상만들자"). 모델 0 · 값 0.
 *   npx tsx engine/tools/dot_reel_new.mts [nabi,haru,yeonu]
 *
 * 기존 `dot_reel_char.mts` 는 캐릭터의 **사진(photos)** 을 쓴다. 새로 만든 셋은 사진이 아직 없고
 * **표정 스프라이트**만 있다 — 그래서 그걸로 만든다. 사진을 새로 그리면 값이 나가는데,
 * 표정은 이미 있고 **표정이 더 할 말이 많다**(두근도트의 알맹이가 "친해지면 표정이 바뀐다" 니까).
 *
 * ## 소리를 꺼도 읽히게
 * 릴스는 소리를 끄고 본다. 그래서 이름·한마디가 **글자로** 떠 있어야 한다.
 * 09-30 편이 조회 130·저장 0 이었던 것을 생각하면, 끝카드는 **할 일 하나**만 적는다.
 */
import sharp from "sharp";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import ffmpegPath from "ffmpeg-static";

for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
}
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();

const 시트칸 = "C:/Users/az518/Desktop/두근도트-시트";
const 나온칸 = "C:/Users/az518/Desktop/두근도트-영상/새캐릭터";
const 임시 = `${나온칸}/장면`;
const FF = ffmpegPath as unknown as string;
if (!FF || !existsSync(FF)) { console.error("ffmpeg 을 못 찾았다"); process.exit(1); }
mkdirSync(임시, { recursive: true });

const W = 1080, H = 1920, FPS = 30, 겹침 = 0.25;
const 글꼴 = "Malgun Gothic, Pretendard, sans-serif";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const 글자 = (x: number, y: number, 글: string, 크기: number, 색: string, 굵기 = 800, 테 = 12) =>
  `<text x="${x}" y="${y}" font-family="${글꼴}" font-size="${크기}" font-weight="${굵기}" fill="${색}" text-anchor="middle"
     style="paint-order:stroke" stroke="#0b0f14" stroke-width="${테}">${esc(글)}</text>`;

const 고른것 = (process.argv[2] ?? "nabi,haru,yeonu").split(",");
const { data } = await db.from("dot_characters").select("slug, name, tagline, is_public").in("slug", 고른것);
const 사람들 = ((data ?? []) as { slug: string; name: string; tagline: string; is_public: boolean }[])
  .filter((c) => c.is_public)
  .sort((a, b) => 고른것.indexOf(a.slug) - 고른것.indexOf(b.slug));
if (!사람들.length) { console.error("공개된 새 캐릭터가 없다 — 먼저 켜야 한다"); process.exit(1); }
console.log(`새 캐릭터 ${사람들.length}명: ${사람들.map((c) => c.name).join(" · ")}`);

/** 표정 한 장을 화면에 크게. 바탕은 캐릭터 색에서 뽑는다 — 사람마다 다른 느낌이 난다. */
async function 표정칸(slug: string, emotion: string, 바탕: string): Promise<Buffer> {
  const f = `${시트칸}/${slug}-${emotion}.png`;
  if (!existsSync(f)) throw new Error(`표정 그림이 없다: ${f}`);
  const 크 = 880;
  const 그림 = await sharp(f).resize(크, 크, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: "nearest" }).png().toBuffer();
  const 바닥 = await sharp({ create: { width: W, height: H, channels: 4, background: 바탕 } }).png().toBuffer();
  return sharp(바닥).composite([{ input: 그림, left: Math.round((W - 크) / 2), top: Math.round((H - 크) / 2) - 120 }]).png().toBuffer();
}

const 색 = ["#2b2440", "#3a2f22", "#22302a"];   // 나비(보라) · 하루(따뜻) · 연우(초록)
type 컷 = { 파일: string; 초: number; 움직임: string; 전환: string };
const 컷들: 컷[] = [];
let n = 0;
const 쓰기 = (png: Buffer) => { const p = `${임시}/${String(++n).padStart(2, "0")}.png`; writeFileSync(p, png); return p; };

// ① 훅 — 소리를 꺼도 읽힌다
컷들.push({
  파일: 쓰기(await sharp(Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${H}" fill="#0b0f14"/>
    ${글자(W / 2, H / 2 - 120, "새 친구", 150, "#ffffff")}
    ${글자(W / 2, H / 2 + 20, `${사람들.length}명 추가`, 92, "#ff5c7a")}
    ${글자(W / 2, H / 2 + 170, "친해지면 표정이 바뀝니다", 48, "#c8d0d8", 600, 8)}
  </svg>`)).png().toBuffer()),
  초: 2.2, 움직임: "들어가기", 전환: "fadewhite",
});

// ② 사람마다 — 평온 한 장, 웃는 얼굴 한 장(표정이 바뀌는 게 이 앱의 알맹이다)
for (const [i, c] of 사람들.entries()) {
  const 바탕 = 색[i % 색.length];
  for (const [emotion, 밑글, 초] of [["neutral", c.tagline, 1.6], ["happy", "", 1.2]] as const) {
    const 바닥 = await 표정칸(c.slug, emotion, 바탕);
    컷들.push({
      파일: 쓰기(await sharp(바닥).composite([{ input: Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
        ${글자(W / 2, H - 430, c.name, 110, "#ffffff")}
        ${밑글 ? 글자(W / 2, H - 320, 밑글, 48, "#ffd9e2", 600, 8) : ""}
      </svg>`) }]).png().toBuffer()),
      초, 움직임: emotion === "neutral" ? "들어가기" : "나오기",
      전환: emotion === "neutral" ? "fade" : "slideleft",
    });
  }
}

// ③ 끝카드 — 할 일 하나만
컷들.push({
  파일: 쓰기(await sharp(Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${H}" fill="#0b0f14"/>
    ${글자(W / 2, H / 2 - 170, "두근도트", 96, "#ffffff")}
    ${글자(W / 2, H / 2 - 40, `이제 ${사람들.length + 3}명`, 64, "#ff5c7a")}
    ${글자(W / 2, H / 2 + 120, "누구부터 말 걸래요?", 56, "#ffffff", 700, 10)}
    ${글자(W / 2, H / 2 + 230, "댓글에 이름 하나", 44, "#c8d0d8", 600, 8)}
  </svg>`)).png().toBuffer()),
  초: 2.8, 움직임: "들어가기", 전환: "",
});

const 입력: string[] = [], 거르기: string[] = [];
const 큰W = Math.round(W * 1.1), 큰H = Math.round(H * 1.1);
컷들.forEach((k, i) => {
  입력.push("-i", k.파일);
  const d = Math.round(k.초 * FPS), cx = "iw/2-(iw/zoom/2)", cy = "ih/2-(ih/zoom/2)";
  const m = k.움직임 === "들어가기" ? { z: "min(1.0+0.003*on,1.2)", x: cx, y: cy } : { z: "max(1.2-0.003*on,1.0)", x: cx, y: cy };
  거르기.push(`[${i}:v]scale=${Math.round(W * 1.3)}:${Math.round(H * 1.3)},zoompan=z='${m.z}':d=${d}:x='${m.x}':y='${m.y}':s=${큰W}x${큰H}:fps=${FPS},` +
    `crop=${W}:${H}:x='(iw-${W})/2+5*sin(t*25)':y='(ih-${H})/2+5*cos(t*21)',setsar=1,format=yuv420p[v${i}]`);
});
let 앞 = "[v0]", 누적 = 컷들[0].초;
for (let i = 1; i < 컷들.length; i++) {
  const 나옴 = i === 컷들.length - 1 ? "[out]" : `[x${i}]`;
  거르기.push(`${앞}[v${i}]xfade=transition=${컷들[i - 1].전환 || "fade"}:duration=${겹침}:offset=${(누적 - 겹침).toFixed(3)}${나옴}`);
  누적 += 컷들[i].초 - 겹침; 앞 = 나옴;
}

const 결과 = `${나온칸}/두근도트-새캐릭터.mp4`;
execFileSync(FF, ["-y", ...입력, "-filter_complex", 거르기.join(";"), "-map", "[out]",
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "21", "-r", String(FPS), "-movflags", "+faststart", 결과],
  { stdio: ["ignore", "ignore", "pipe"] });

const ffprobe = (await import("ffprobe-static")).default as unknown as { path: string };
const j = JSON.parse(execFileSync(ffprobe.path, ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", 결과]).toString()) as
  { format: { duration: string; size: string }; streams: { width?: number; height?: number }[] };
const 길이 = Number(j.format.duration), 영상 = j.streams.find((s) => s.width);
const 잼: [string, boolean, string][] = [
  ["길이가 기대와 맞나", Math.abs(길이 - 누적) < 1, `${길이.toFixed(1)}초 (기대 ${누적.toFixed(1)})`],
  ["릴스 길이(8~20초)", 길이 >= 8 && 길이 <= 20, `${길이.toFixed(1)}초`],
  ["세로 9:16", 영상?.width === W && 영상?.height === H, `${영상?.width}x${영상?.height}`],
  ["끝카드가 2.5초 넘나", 컷들[컷들.length - 1].초 >= 2.5, `${컷들[컷들.length - 1].초}초`],
  ["20MB 아래", Number(j.format.size) / 1048576 < 20, `${(Number(j.format.size) / 1048576).toFixed(1)}MB`],
];
console.log();
for (const [이름, ok, 값] of 잼) console.log(`${ok ? "맞음  " : "**어긋남**"} ${이름} — ${값}`);
console.log(`\n${잼.filter((x) => x[1]).length}/${잼.length} → ${결과}`);
rmSync(임시, { recursive: true, force: true });
if (잼.some((x) => !x[1])) process.exitCode = 1;
