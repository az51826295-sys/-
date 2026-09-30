/**
 * **말투 비교 릴스 2판 — 훅과 물음** (228회차 09-30). 값 0 · 모델 0.
 *   npx tsx engine/tools/dot_reel_voice2.mts
 *
 * 1판(`dot_reel_voice.mts`)은 비교 카드 셋을 훑어 내려가기만 했다. 09-30 첫 릴스 실측:
 * **조회 130 · 저장·공유·팔로우 0**. 본 사람은 있었고 **누를 이유가 없었다.**
 * 그래서 이 판은 앞뒤에 하나씩만 더한다 — 가운데(실제 앱이 한 대답)는 그대로 둔다.
 *
 *  ① **첫 1.5초에 대사** — 앱 화면이 아니라 서하의 말로 연다. 첫 컷이 광고처럼 보이면 손가락이 먼저 지나간다.
 *     사장님이 인스타 게시물에 적은 첫마디 그대로다(내가 지어낸 대사가 아니다).
 *  ② **끝에 물음** — "누구랑 얘기할래? 댓글로". 댓글 하나 다는 것이 팔로우보다 쉽고,
 *     그 답이 곧 설문(어느 캐릭터를 더 만들까)이다.
 *
 * 가운데 카드는 `dot_voice_cards.mts` 가 **실제 서버에서 받은 답**으로 만든 것이다 — 그대로 쓴다.
 */
import sharp from "sharp";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import ffmpegPath from "ffmpeg-static";

// 두근도트 DB(로키가 아니다) — 사진은 `dot_characters.photos` 에서 받는다.
// 09-30 첫 판에 `캐릭터별/seoha/01.png` 를 썼다가 **이름 카드**(글자가 구워진 화면)가 깔려
// 카드 안에 카드가 들어가고 "친해지면?" 과 겹쳤다. 만들어진 화면 말고 **원본**을 쓴다.
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
}
const { createServiceClient } = await import("../../src/lib/supabase/service");
const db = createServiceClient();

const FF = ffmpegPath as unknown as string;
const 카드칸 = "C:/Users/az518/Desktop/두근도트-인스타/말투비교";
const OUT = "C:/Users/az518/Desktop/두근도트-영상";
const 임시 = `${OUT}/말투비교2장면`;
mkdirSync(임시, { recursive: true });

const W = 1080, H = 1920, FPS = 30, 겹침 = 0.35;
const 글꼴 = "Malgun Gothic, Pretendard, sans-serif";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const 도장 = `${OUT}/장면2/_도장.png`;
if (!existsSync(도장)) { console.error("도장이 없다 — dot_reel3.mts 를 먼저"); process.exit(1); }

/** 한글은 글자 폭이 거의 같다 — 글자 수로 접는다(비교 카드와 같은 방식). */
function 접기(글: string, 한줄: number): string[] {
  const 줄: string[] = [];
  let 남 = 글.trim();
  while (남.length > 한줄) {
    let 자를곳 = 남.lastIndexOf(" ", 한줄);
    if (자를곳 < 한줄 * 0.5) 자를곳 = 한줄;
    줄.push(남.slice(0, 자를곳).trim());
    남 = 남.slice(자를곳).trim();
  }
  if (남) 줄.push(남);
  return 줄;
}

/** 캐릭터 사진을 크게 흐리게 깔고 어둡게 덮은 세로 판 — 카드마다 그 사람 색이 배경이 된다(2판에서 가져옴). */
async function 바탕(그림: string | Buffer, 밝기: number): Promise<Buffer> {
  return sharp(그림).resize(W, H, { fit: "cover" }).blur(50).modulate({ brightness: 밝기 }).toBuffer();
}

/** 네모로 다듬어 모서리를 둥글린다(원본 비율이 제각각이라 그대로 두면 판마다 크기가 튄다). */
async function 다듬기(buf: Buffer, 크: number): Promise<Buffer> {
  return sharp(buf).resize(크, 크, { fit: "cover", position: "top" })
    .composite([{ input: Buffer.from(`<svg width="${크}" height="${크}"><rect width="${크}" height="${크}" rx="28" ry="28" fill="#fff"/></svg>`), blend: "dest-in" }])
    .png().toBuffer();
}

/**
 * 카드 아래쪽 **빈 띠를 잘라낸다.** 비교 카드는 4:5 로 고정인데 말풍선이 짧으면 아래가 통째로 비고,
 * 훑어 내려가는 영상에서는 그 빈 곳을 몇 초씩 지나게 된다(피드에 한 장으로 볼 때는 안 거슬린다).
 * 줄 전체가 한 색인 구간 중 **가장 긴 것**만 자른다 — 글자나 말풍선이 있는 줄은 색이 섞여 있어 안 걸린다.
 */
async function 빈칸자르기(p: string): Promise<Buffer> {
  const { data, info } = await sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: ch } = info;
  const 한색 = (y: number) => {
    const o = y * w * ch;
    for (let x = 1; x < w; x++) for (let c = 0; c < 3; c++) if (data[o + x * ch + c] !== data[o + c]) return false;
    return true;
  };
  let 최고시작 = -1, 최고길이 = 0, 시작 = -1;
  for (let y = 0; y <= h; y++) {
    if (y < h && 한색(y)) { if (시작 < 0) 시작 = y; continue; }
    if (시작 >= 0) { if (y - 시작 > 최고길이) { 최고길이 = y - 시작; 최고시작 = 시작; } 시작 = -1; }
  }
  const 남길 = 60;   // 말풍선과 아래 글자가 붙지 않게 조금 남긴다
  if (최고길이 < 200) return sharp(p).png().toBuffer();
  const 자를높이 = 최고길이 - 남길;
  const 위 = await sharp(p).extract({ left: 0, top: 0, width: w, height: 최고시작 + 남길 }).toBuffer();
  const 아래 = await sharp(p).extract({ left: 0, top: 최고시작 + 최고길이, width: w, height: h - (최고시작 + 최고길이) }).toBuffer();
  console.log(`  빈 띠 ${자를높이}px 잘라냄 (${최고시작}~${최고시작 + 최고길이})`);
  return sharp({ create: { width: w, height: h - 자를높이, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } })
    .composite([{ input: 위, top: 0, left: 0 }, { input: 아래, top: 최고시작 + 남길, left: 0 }]).png().toBuffer();
}

const { data: cs } = await db.from("dot_characters").select("slug, name, photos").eq("is_public", true);
const 사진첩 = new Map<string, Buffer>();
for (const c of ((cs ?? []) as { slug: string; name: string; photos: { url: string }[] | null }[])) {
  const u = (c.photos ?? []).map((p) => p.url).filter(Boolean)[0];
  if (u) 사진첩.set(c.name, Buffer.from(await (await fetch(u)).arrayBuffer()));
}
const 서하사진 = 사진첩.get("서하");
if (!서하사진) { console.error("서하 사진을 DB 에서 못 받았다"); process.exit(1); }

// ── 장면 ①: 훅 — 서하의 첫마디 ────────────────────────────────
{
  const 대사 = "...딱히 너 때문은 아니야.";
  const 줄들 = 접기(대사, 13);
  const 크기 = 78, 줄높이 = 104;
  const 시작 = Math.round(H / 2 - (줄들.length * 줄높이) / 2) - 150;   // 사진 위로 충분히 — "— 서하" 가 사진에 가렸다
  // 사람을 아래쪽에 크게 두고, 글자는 그 위 빈 자리에. 겹치면 둘 다 안 읽힌다.
  const 크 = 640;
  const 사람 = await 다듬기(서하사진, 크);
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <text x="${W / 2}" y="${시작 - 130}" font-family="${글꼴}" font-size="36" fill="#ffd9e6" text-anchor="middle" letter-spacing="6">처음 만난 날</text>
    ${줄들.map((l, i) => `<text x="${W / 2}" y="${시작 + i * 줄높이}" font-family="${글꼴}" font-size="${크기}" font-weight="800" fill="#ffffff" text-anchor="middle" style="paint-order:stroke" stroke="#0b0f14" stroke-width="10">${esc(l)}</text>`).join("")}
    <text x="${W / 2}" y="${시작 + 줄들.length * 줄높이 + 60}" font-family="${글꼴}" font-size="40" fill="#ffffff" text-anchor="middle" opacity="0.85">— 서하</text>
    <text x="${W / 2}" y="${H - 140}" font-family="${글꼴}" font-size="56" font-weight="800" fill="#ffd9e6" text-anchor="middle" style="paint-order:stroke" stroke="#0b0f14" stroke-width="10">친해지면?</text>
  </svg>`;
  const 판 = await sharp(await 바탕(서하사진, 0.45))
    .composite([
      { input: 사람, left: Math.round((W - 크) / 2), top: H - 크 - 230 },
      { input: Buffer.from(svg), top: 0, left: 0 },
    ]).png().toBuffer();
  writeFileSync(`${임시}/00-훅.png`, 판);
}

// ── 장면 ②③④: 비교 카드 셋 (1판과 같다 — 실제 앱이 한 대답) ──
const 순서 = ["유나", "서하", "린"];
const 카드장면: string[] = [];
for (const 이름 of 순서) {
  const p = `${카드칸}/말투비교-${이름}.png`;
  if (!existsSync(p)) { console.log(`${이름} 카드 없음 — 건너뜀`); continue; }
  console.log(`${이름} 카드`);
  const 카드 = await sharp(await 빈칸자르기(p)).resize({ width: 1020 }).toBuffer();
  const m = await sharp(카드).metadata();
  const 판 = await sharp(await 바탕(p, 0.7))
    .composite([{ input: 카드, left: 30, top: Math.round((H - (m.height ?? 0)) / 2) }]).png().toBuffer();
  const 파일 = `${임시}/${이름}.png`; writeFileSync(파일, 판); 카드장면.push(파일);
}
if (!카드장면.length) { console.error("비교 카드가 하나도 없다 — dot_voice_cards.mts 를 먼저"); process.exit(1); }

// ── 장면 ⑤: 물음 — 누구랑 얘기할래? ──────────────────────────
{
  const 사진들 = 순서.filter((n) => 사진첩.has(n)).map((n) => ({ 이름: n, 그림: 사진첩.get(n)! }));
  // **가장자리에 붙이지 않는다** — 화면을 천천히 당기면 가장자리가 잘려 나간다(첫 판에 유나·린이 반씩 잘렸다).
  const 안쪽 = Math.round(W * 0.88), 여백 = Math.round((W - 안쪽) / 2);
  const 칸 = Math.floor(안쪽 / Math.max(1, 사진들.length));
  const 크 = Math.min(292, 칸 - 24);
  const 얼굴: sharp.OverlayOptions[] = [];
  for (const [i, s] of 사진들.entries()) {
    얼굴.push({ input: await 다듬기(s.그림, 크), left: Math.round(여백 + 칸 * i + (칸 - 크) / 2), top: 1000 });
  }
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <text x="${W / 2}" y="640" font-family="${글꼴}" font-size="86" font-weight="800" fill="#ffffff" text-anchor="middle">누구랑</text>
    <text x="${W / 2}" y="750" font-family="${글꼴}" font-size="86" font-weight="800" fill="#ffffff" text-anchor="middle">얘기할래?</text>
    <text x="${W / 2}" y="850" font-family="${글꼴}" font-size="44" fill="#ffd9e6" text-anchor="middle">댓글로 알려 줘</text>
    ${사진들.map((s, i) => `<text x="${여백 + 칸 * i + 칸 / 2}" y="${1000 + 크 + 78}" font-family="${글꼴}" font-size="48" font-weight="700" fill="#ffffff" text-anchor="middle" style="paint-order:stroke" stroke="#0b0f14" stroke-width="8">${esc(s.이름)}</text>`).join("")}
    <text x="${W / 2}" y="1660" font-family="${글꼴}" font-size="40" fill="#ffffff" text-anchor="middle" opacity="0.9">베타 신청은 프로필 링크에</text>
  </svg>`;
  const 판 = await sharp(await 바탕(서하사진, 0.35))
    .composite([...얼굴, { input: Buffer.from(svg), top: 0, left: 0 }]).png().toBuffer();
  writeFileSync(`${임시}/99-물음.png`, 판);
}

// ── 잇기 ───────────────────────────────────────────────────
// 훅은 짧게(손가락이 멈출 만큼만), 카드는 읽을 시간을 주고, 물음은 읽고 누를 만큼.
const 장면: { 파일: string; 초: number; 넘김: string }[] = [
  { 파일: `${임시}/00-훅.png`, 초: 1.8, 넘김: "fade" },
  ...카드장면.map((f) => ({ 파일: f, 초: 4.2, 넘김: "slideleft" })),
  { 파일: `${임시}/99-물음.png`, 초: 2.8, 넘김: "fade" },
];

const 입력: string[] = [], 거르기: string[] = [];
장면.forEach((s, i) => {
  입력.push("-i", s.파일);
  const d = Math.round(s.초 * FPS);
  // 카드는 위→아래로 훑는다(읽는 순서). 훅·물음은 가운데를 천천히 당긴다.
  const 훑기 = i > 0 && i <= 카드장면.length;
  const y = 훑기 ? `(ih-ih/zoom)*on/${d}` : "ih/2-(ih/zoom/2)";
  // 훅·물음은 아주 조금만 당긴다(1.02→1.08). 세게 당기면 가장자리 글자·사진이 잘려 나간다.
  const z = 훑기 ? "1.18" : `1.02+0.06*on/${d}`;
  거르기.push(`[${i}:v]scale=${Math.round(W * 1.3)}:${Math.round(H * 1.3)},zoompan=z='${z}':d=${d}:x='iw/2-(iw/zoom/2)':y='${y}':s=${W}x${H}:fps=${FPS},setsar=1,format=yuv420p[v${i}]`);
});
let 앞 = "[v0]", 누적 = 장면[0].초;
for (let i = 1; i < 장면.length; i++) {
  const 나옴 = i === 장면.length - 1 ? "[이은것]" : `[x${i}]`;
  거르기.push(`${앞}[v${i}]xfade=transition=${장면[i].넘김}:duration=${겹침}:offset=${(누적 - 겹침).toFixed(3)}${나옴}`);
  누적 += 장면[i].초 - 겹침; 앞 = 나옴;
}
입력.push("-i", 도장);
거르기.push(`[${장면.length}:v]format=rgba,colorchannelmixer=aa=0.92[도장]`, `[이은것][도장]overlay=x=40:y=64:format=auto[out]`);

const 결과 = `${OUT}/두근도트-말투비교2.mp4`;
execFileSync(FF, ["-y", ...입력, "-filter_complex", 거르기.join(";"), "-map", "[out]", "-c:v", "libx264", "-pix_fmt", "yuv420p",
  "-preset", "veryfast", "-crf", "21", "-r", String(FPS), "-movflags", "+faststart", 결과], { stdio: ["ignore", "ignore", "pipe"] });

const ffprobe = (await import("ffprobe-static")).default as unknown as { path: string };
const j = JSON.parse(execFileSync(ffprobe.path, ["-v", "quiet", "-print_format", "json", "-show_format", 결과]).toString()) as { format: { duration: string; size: string } };
const 길이 = Number(j.format.duration);
console.log(`장면 ${장면.length}개 · ${길이.toFixed(1)}초 (기대 ${누적.toFixed(1)}) ${Math.abs(길이 - 누적) < 1 ? "맞음" : "**틀림**"} · ${(Number(j.format.size) / 1048576).toFixed(1)}MB → ${결과}`);
