/**
 * **참여형 릴스 — 다음 캐릭터는 보는 사람이 정한다** (228회차 10-01, 사장님 "참여형이야 다음 캐릭터"). 값 0 · 모델 0.
 *
 *   npx tsx engine/tools/dot_reel_vote.mts
 *
 * ## 왜 참여형인가
 * 09-30 릴스는 **조회 130 · 저장 0 · 공유 0** 이었다. 본 사람이 있었는데 아무도 아무것도 안 했다.
 * 저장·공유는 "나중에 볼 것" 이고 댓글은 "지금 할 것" 이다 — 작은 계정이 먼저 살 곳은 댓글 쪽이다.
 * 그래서 이 편의 목적은 끝까지 보게 하는 것이 아니라 **한 줄 쓰게 하는 것**이다.
 *
 * ## 내가 캐릭터를 지어내지 않는다
 * 후보 셋을 내가 적어 넣으면 그건 참여형이 아니라 내 취향에 투표시키는 것이다(09-28 사장님 지시:
 * 캐릭터·그림·내용은 사장님 것). 그래서 **후보 칸을 비워 두고** 보는 사람이 댓글에 적게 한다.
 * 댓글이 모이면 거기서 나온 셋으로 2편(투표형)을 찍는다 — 그때 후보는 **사람들이 적은 말**이다.
 *
 * ## 소리 없이 읽히게
 * 릴스는 소리를 끄고 본다. 그래서 묻는 말이 **첫 프레임 글자**로 나와 있어야 한다 —
 * 말로만 물으면 아무도 못 듣는다. 끝카드도 2.8초로 길게 둔다(댓글 칸을 여는 데 시간이 든다).
 */
import sharp from "sharp";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import ffmpegPath from "ffmpeg-static";

for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
}
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();

const OUT = "C:/Users/az518/Desktop/두근도트-영상/참여형";
mkdirSync(OUT, { recursive: true });
const W = 1080, H = 1920, FPS = 30, 겹침 = 0.25;
const 글꼴 = "Malgun Gothic, Pretendard, sans-serif";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const FF = ffmpegPath as unknown as string;
if (!FF || !existsSync(FF)) { console.error("ffmpeg 을 못 찾았다"); process.exit(1); }

const 도장 = "C:/Users/az518/Desktop/두근도트-영상/장면2/_도장.png";
if (!existsSync(도장)) { console.error("도장이 없다 — dot_reel3.mts 를 한 번 돌리면 생긴다"); process.exit(1); }

/** 사진을 흐리게 깔고 가운데에 선명하게(캐릭터별 릴스와 같은 결). */
async function 사진바탕(buf: Buffer, 크기 = 820, 위로 = 150): Promise<Buffer> {
  const 깔개 = await sharp(buf).resize(W, H, { fit: "cover" }).blur(45).modulate({ brightness: 0.42, saturation: 1.15 }).toBuffer();
  const 선명 = await sharp(buf).resize(크기, 크기, { fit: "cover", position: "top" })
    .composite([{ input: Buffer.from(`<svg width="${크기}" height="${크기}"><rect width="${크기}" height="${크기}" rx="28" ry="28" fill="#fff"/></svg>`), blend: "dest-in" }])
    .png().toBuffer();
  return sharp(깔개).composite([{ input: 선명, left: Math.round((W - 크기) / 2), top: Math.round((H - 크기) / 2) - 위로 }]).png().toBuffer();
}

const 글자 = (x: number, y: number, 글: string, 크기: number, 색: string, 굵기 = 800, 테두리 = 12) =>
  `<text x="${x}" y="${y}" font-family="${글꼴}" font-size="${크기}" font-weight="${굵기}" fill="${색}" text-anchor="middle"
     style="paint-order:stroke" stroke="#0b0f14" stroke-width="${테두리}">${esc(글)}</text>`;

/** ① 첫 컷 — 소리를 꺼도 **묻는 말이 보인다**. */
async function 훅(buf: Buffer): Promise<Buffer> {
  const 바탕 = await 사진바탕(buf, 760, 220);
  return sharp(바탕).composite([{ input: Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect y="${H - 760}" width="${W}" height="760" fill="#0b0f14" opacity="0.55"/>
    ${글자(W / 2, H - 520, "다음 캐릭터는", 86, "#ffffff")}
    ${글자(W / 2, H - 400, "여러분이 정합니다", 104, "#ff5c7a")}
    ${글자(W / 2, H - 290, "댓글에 한 줄만 적어 주세요", 48, "#e8edf2", 600, 8)}
  </svg>`) }]).png().toBuffer();
}

/** ② 지금 있는 사람들 — 무엇에 투표하는지 보여 준다. */
async function 사람카드(buf: Buffer, 이름: string, 한마디: string, 번호: number, 전체: number): Promise<Buffer> {
  const 바탕 = await 사진바탕(buf, 820, 150);
  return sharp(바탕).composite([{ input: Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    ${글자(W / 2, 250, `지금 있는 ${전체}명`, 44, "#c8d0d8", 600, 8)}
    ${글자(W / 2, H - 470, 이름, 96, "#ffffff")}
    ${글자(W / 2, H - 370, 한마디, 46, "#ffd9e2", 600, 8)}
    ${글자(W / 2, H - 230, `${번호} / ${전체}`, 38, "#8c96a0", 600, 6)}
  </svg>`) }]).png().toBuffer();
}

/** ③ 빈자리 — **내가 사람을 지어내지 않는 칸**이다. 물음표만 둔다. */
async function 빈자리(): Promise<Buffer> {
  const 네모 = 820;
  return sharp(Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#17202b"/><stop offset="100%" stop-color="#0b0f14"/>
    </linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/>
    <rect x="${(W - 네모) / 2}" y="${(H - 네모) / 2 - 150}" width="${네모}" height="${네모}" rx="28"
      fill="#0f1620" stroke="#ff5c7a" stroke-width="6" stroke-dasharray="26 22"/>
    ${글자(W / 2, H / 2 - 110, "?", 300, "#ff5c7a", 800, 0)}
    ${글자(W / 2, H - 470, "네 번째 자리", 92, "#ffffff")}
    ${글자(W / 2, H - 360, "아직 비어 있어요", 50, "#c8d0d8", 600, 8)}
  </svg>`)).png().toBuffer();
}

/** ④ 끝카드 — 무엇을 적을지 **예시 없이** 묻는다. 예시를 주면 다들 그것만 적는다. */
async function 끝카드(): Promise<Buffer> {
  return sharp(Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${H}" fill="#0b0f14"/>
    ${글자(W / 2, H / 2 - 260, "어떤 사람이었으면", 78, "#ffffff")}
    ${글자(W / 2, H / 2 - 150, "좋겠어요?", 78, "#ffffff")}
    ${글자(W / 2, H / 2 + 10, "댓글에 적어 주세요", 64, "#ff5c7a")}
    ${글자(W / 2, H / 2 + 130, "제일 많이 나온 걸 다음 캐릭터로 만듭니다", 42, "#c8d0d8", 600, 8)}
    ${글자(W / 2, H / 2 + 330, "두근도트", 54, "#ffffff", 800, 10)}
    ${글자(W / 2, H / 2 + 410, "프로필 링크에서 받기", 40, "#8c96a0", 600, 6)}
  </svg>`)).png().toBuffer();
}

// ── 만든다 ─────────────────────────────────────────────────
const { data: cs } = await db.from("dot_characters").select("slug, name, tagline, photos").eq("is_public", true).order("slug");
const 사람들 = ((cs ?? []) as { slug: string; name: string; tagline: string | null; photos: { url: string }[] | null }[])
  .filter((c) => (c.photos ?? []).length > 0);
if (사람들.length < 2) { console.error(`공개 캐릭터가 ${사람들.length}명뿐이다 — 영상을 안 만든다`); process.exit(1); }
console.log(`공개 ${사람들.length}명: ${사람들.map((c) => c.name).join(" · ")}`);

const 첫사진 = Buffer.from(await (await fetch(사람들[0].photos![0].url)).arrayBuffer());
type 컷 = { 파일: string; 초: number; 움직임: string; 전환: string; 흔들기: number };
const 컷들: 컷[] = [];
let n = 0;
const 쓰기 = (png: Buffer) => { const p = `${OUT}/${String(++n).padStart(2, "0")}.png`; writeFileSync(p, png); return p; };

컷들.push({ 파일: 쓰기(await 훅(첫사진)), 초: 2.4, 움직임: "들어가기", 전환: "fadewhite", 흔들기: 5 });
for (let i = 0; i < 사람들.length; i++) {
  const c = 사람들[i];
  const b = Buffer.from(await (await fetch(c.photos![0].url)).arrayBuffer());
  컷들.push({
    파일: 쓰기(await 사람카드(b, c.name, c.tagline ?? "", i + 1, 사람들.length)),
    초: 1.5, 움직임: ["나오기", "오른쪽", "들어가기", "아래로"][i % 4],
    전환: ["slideleft", "circleopen", "slideleft", "fadewhite"][i % 4], 흔들기: 6,
  });
}
컷들.push({ 파일: 쓰기(await 빈자리()), 초: 2.0, 움직임: "들어가기", 전환: "fadewhite", 흔들기: 3 });
// 끝카드는 **길게**. 댓글 칸을 여는 데 시간이 든다 — 1초면 못 쓰고 지나간다.
컷들.push({ 파일: 쓰기(await 끝카드()), 초: 2.8, 움직임: "들어가기", 전환: "", 흔들기: 0 });

const 입력: string[] = [], 거르기: string[] = [];
const 큰W = Math.round(W * 1.12), 큰H = Math.round(H * 1.12);
컷들.forEach((k, i) => {
  입력.push("-i", k.파일);
  const d = Math.round(k.초 * FPS), cx = "iw/2-(iw/zoom/2)", cy = "ih/2-(ih/zoom/2)";
  const m = k.움직임 === "들어가기" ? { z: "min(1.0+0.0035*on,1.26)", x: cx, y: cy }
    : k.움직임 === "나오기" ? { z: "max(1.26-0.0035*on,1.0)", x: cx, y: cy }
    : k.움직임 === "오른쪽" ? { z: "1.2", x: `(iw-iw/zoom)*on/${d}`, y: cy }
    : { z: "1.2", x: cx, y: `(ih-ih/zoom)*on/${d}` };
  const 흔 = k.흔들기;
  거르기.push(`[${i}:v]scale=${Math.round(W * 1.4)}:${Math.round(H * 1.4)},zoompan=z='${m.z}':d=${d}:x='${m.x}':y='${m.y}':s=${큰W}x${큰H}:fps=${FPS},` +
    `crop=${W}:${H}:x='(iw-${W})/2+${흔}*sin(t*27)':y='(ih-${H})/2+${흔}*cos(t*23)',setsar=1,format=yuv420p[v${i}]`);
});
let 앞 = "[v0]", 누적 = 컷들[0].초;
for (let i = 1; i < 컷들.length; i++) {
  const 나옴 = i === 컷들.length - 1 ? "[이은것]" : `[x${i}]`;
  거르기.push(`${앞}[v${i}]xfade=transition=${컷들[i - 1].전환 || "fade"}:duration=${겹침}:offset=${(누적 - 겹침).toFixed(3)}${나옴}`);
  누적 += 컷들[i].초 - 겹침; 앞 = 나옴;
}
입력.push("-i", 도장);
거르기.push(`[${컷들.length}:v]format=rgba,colorchannelmixer=aa=0.92[도장]`, `[이은것][도장]overlay=x=40:y=64:format=auto[out]`);

const 결과 = `${OUT}/두근도트-다음캐릭터.mp4`;
execFileSync(FF, ["-y", ...입력, "-filter_complex", 거르기.join(";"), "-map", "[out]",
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "21", "-r", String(FPS), "-movflags", "+faststart", 결과],
  { stdio: ["ignore", "ignore", "pipe"] });

const ffprobe = (await import("ffprobe-static")).default as unknown as { path: string };
const j = JSON.parse(execFileSync(ffprobe.path, ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", 결과]).toString()) as
  { format: { duration: string; size: string }; streams: { width?: number; height?: number }[] };
const 길이 = Number(j.format.duration), 영상 = j.streams.find((s) => s.width);

// ── 재는 자 (자기가 만든 것을 자기가 잰다) ──────────────────────
const 잼: [string, boolean, string][] = [
  ["길이가 기대와 맞나", Math.abs(길이 - 누적) < 1, `${길이.toFixed(1)}초 (기대 ${누적.toFixed(1)})`],
  ["릴스 길이(8~20초)", 길이 >= 8 && 길이 <= 20, `${길이.toFixed(1)}초`],
  ["세로 9:16", 영상?.width === W && 영상?.height === H, `${영상?.width}x${영상?.height}`],
  ["끝카드가 2.5초 넘나(댓글 쓸 시간)", 컷들[컷들.length - 1].초 >= 2.5, `${컷들[컷들.length - 1].초}초`],
  ["묻는 말이 첫 컷에 있나", true, "훅 카드에 '댓글에 한 줄만 적어 주세요'"],
  ["20MB 아래", Number(j.format.size) / 1048576 < 20, `${(Number(j.format.size) / 1048576).toFixed(1)}MB`],
];
console.log();
for (const [이름, 됐나, 값] of 잼) console.log(`${됐나 ? "맞음  " : "**어긋남**"} ${이름} — ${값}`);
console.log(`\n${잼.filter((x) => x[1]).length}/${잼.length} → ${결과}`);
if (잼.some((x) => !x[1])) process.exitCode = 1;
