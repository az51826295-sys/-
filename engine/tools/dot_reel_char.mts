/**
 * **캐릭터 한 명짜리 릴스** (227회차 09-30, 사장님 "오늘 최대한 고효율로 크레딧 다 써야해"). 값 0 · 모델 0.
 *
 *   npx tsx engine/tools/dot_reel_char.mts            # 공개 캐릭터 전부
 *   npx tsx engine/tools/dot_reel_char.mts yuna       # 한 명만
 *
 * 크레딧을 쓰라고 하셨지만 **영상은 돈이 안 드는 쪽**이 가장 효율이 높다 — 캐릭터마다 이미 사진이
 * 4장씩 있다. 한 편에 한 명: 이름 카드 → 그 캐릭터의 사진 네 장 → 끝카드. 13초 안팎.
 *
 * 3판(`dot_reel3.mts`)의 효과를 그대로 쓴다: 흔들림·기울임·흰 번쩍임·아이콘 도장.
 * 색 튐(글리치)은 뺀다 — 한 사람의 사진을 이어 보는 영상이라 색이 튀면 그 사람 그림이 망가져 보인다.
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

const 누구 = process.argv[2];
const OUT = "C:/Users/az518/Desktop/두근도트-영상/캐릭터별";
mkdirSync(OUT, { recursive: true });
const W = 1080, H = 1920, FPS = 30, 겹침 = 0.3;
const 글꼴 = "Malgun Gothic, Pretendard, sans-serif";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const FF = ffmpegPath as unknown as string;
if (!FF || !existsSync(FF)) { console.error("ffmpeg 을 못 찾았다"); process.exit(1); }

/** 사진을 흐리게 깔고 가운데에 선명하게 — 2판에서 사장님이 분홍 대신 고른 결. */
async function 사진장면(buf: Buffer): Promise<Buffer> {
  const 깔개 = await sharp(buf).resize(W, H, { fit: "cover" }).blur(40).modulate({ brightness: 0.5, saturation: 1.2 }).toBuffer();
  const 크 = 900;
  const 선명 = await sharp(buf).resize(크, 크, { fit: "cover", position: "top" })
    .composite([{ input: Buffer.from(`<svg width="${크}" height="${크}"><rect width="${크}" height="${크}" rx="30" ry="30" fill="#fff"/></svg>`), blend: "dest-in" }])
    .png().toBuffer();
  return sharp(깔개).composite([{ input: 선명, left: Math.round((W - 크) / 2), top: Math.round((H - 크) / 2) - 60 }]).png().toBuffer();
}

async function 이름카드(buf: Buffer, 이름: string, 한마디: string): Promise<Buffer> {
  const 바탕 = await 사진장면(buf);
  return sharp(바탕).composite([{ input: Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <text x="${W / 2}" y="${H - 360}" font-family="${글꼴}" font-size="104" font-weight="800" fill="#fff" text-anchor="middle"
      style="paint-order:stroke" stroke="#0b0f14" stroke-width="12">${esc(이름)}</text>
    <text x="${W / 2}" y="${H - 250}" font-family="${글꼴}" font-size="52" fill="#ffd9e2" text-anchor="middle"
      style="paint-order:stroke" stroke="#0b0f14" stroke-width="8">${esc(한마디)}</text>
  </svg>`) }]).png().toBuffer();
}

/**
 * 받침 있으면 "과", 없으면 "와". 첫 판에 "린와(과)" 로 찍혔다 — 기계가 만든 티가 그대로 났다.
 * 마지막 글자가 한글이 아니면(영문 이름 등) "와" 로 둔다.
 */
function 와과(이름: string): string {
  const c = 이름.charCodeAt(이름.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return "와";
  return (c - 0xac00) % 28 === 0 ? "와" : "과";
}

async function 끝카드(이름: string): Promise<Buffer> {
  return sharp(Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${H}" fill="#0b0f14"/>
    <text x="${W / 2}" y="${H / 2 - 110}" font-family="${글꼴}" font-size="70" font-weight="800" fill="#fff" text-anchor="middle">${esc(이름)}${와과(이름)} 이야기해 보세요</text>
    <text x="${W / 2}" y="${H / 2 + 10}" font-family="${글꼴}" font-size="52" font-weight="700" fill="#ff5c7a" text-anchor="middle">두근도트 베타 테스터 모집 중</text>
    <text x="${W / 2}" y="${H / 2 + 110}" font-family="${글꼴}" font-size="42" fill="#c8d0d8" text-anchor="middle">프로필 링크에서 신청</text>
  </svg>`)).png().toBuffer();
}

/** 3판과 같은 도장(아이콘+이름). 한 번 만들어 둔 것이 있으면 쓴다. */
const 도장 = "C:/Users/az518/Desktop/두근도트-영상/장면2/_도장.png";
if (!existsSync(도장)) { console.error("도장이 없다 — dot_reel3.mts 를 한 번 돌리면 생긴다"); process.exit(1); }

const { data: cs } = await db.from("dot_characters").select("slug, name, tagline, photos").eq("is_public", true);
const 사람들 = ((cs ?? []) as { slug: string; name: string; tagline: string | null; photos: { url: string }[] | null }[])
  .filter((c) => !누구 || c.slug === 누구);

for (const c of 사람들) {
  const 사진 = (c.photos ?? []).map((p) => p.url).filter(Boolean);
  if (사진.length < 2) { console.log(`${c.name}: 사진이 ${사진.length}장뿐 — 건너뜀`); continue; }
  const 칸 = `${OUT}/${c.slug}`;
  mkdirSync(칸, { recursive: true });
  const bufs = await Promise.all(사진.slice(0, 4).map(async (u) => Buffer.from(await (await fetch(u)).arrayBuffer())));

  type 컷 = { 파일: string; 초: number; 움직임: string; 전환: string };
  const 컷들: 컷[] = [];
  const 쓰기 = (png: Buffer, i: number) => { const p = `${칸}/${String(i).padStart(2, "0")}.png`; writeFileSync(p, png); return p; };
  컷들.push({ 파일: 쓰기(await 이름카드(bufs[0], c.name, c.tagline ?? ""), 1), 초: 2.2, 움직임: "들어가기", 전환: "fadewhite" });
  const 방향 = ["나오기", "오른쪽", "들어가기", "아래로"];
  for (let i = 0; i < bufs.length; i++) {
    컷들.push({ 파일: 쓰기(await 사진장면(bufs[i]), i + 2), 초: 2.0, 움직임: 방향[i % 4], 전환: ["slideleft", "zoomin", "circleopen", "fadewhite"][i % 4] });
  }
  컷들.push({ 파일: 쓰기(await 끝카드(c.name), 컷들.length + 1), 초: 2.4, 움직임: "들어가기", 전환: "" });

  const 입력: string[] = [], 거르기: string[] = [];
  const 큰W = Math.round(W * 1.12), 큰H = Math.round(H * 1.12);
  컷들.forEach((k, i) => {
    입력.push("-i", k.파일);
    const d = Math.round(k.초 * FPS), cx = "iw/2-(iw/zoom/2)", cy = "ih/2-(ih/zoom/2)";
    const m = k.움직임 === "들어가기" ? { z: "min(1.0+0.004*on,1.3)", x: cx, y: cy }
      : k.움직임 === "나오기" ? { z: "max(1.3-0.004*on,1.0)", x: cx, y: cy }
      : k.움직임 === "오른쪽" ? { z: "1.22", x: `(iw-iw/zoom)*on/${d}`, y: cy }
      : { z: "1.22", x: cx, y: `(ih-ih/zoom)*on/${d}` };
    거르기.push(`[${i}:v]scale=${Math.round(W * 1.45)}:${Math.round(H * 1.45)},zoompan=z='${m.z}':d=${d}:x='${m.x}':y='${m.y}':s=${큰W}x${큰H}:fps=${FPS},` +
      `rotate=a='0.012*sin(t*6)':ow=iw:oh=ih:c=black@0,crop=${W}:${H}:x='(iw-${W})/2+7*sin(t*29)':y='(ih-${H})/2+7*cos(t*25)',setsar=1,format=yuv420p[v${i}]`);
  });
  let 앞 = "[v0]", 누적 = 컷들[0].초;
  for (let i = 1; i < 컷들.length; i++) {
    const 나옴 = i === 컷들.length - 1 ? "[이은것]" : `[x${i}]`;
    거르기.push(`${앞}[v${i}]xfade=transition=${컷들[i - 1].전환 || "fade"}:duration=${겹침}:offset=${(누적 - 겹침).toFixed(3)}${나옴}`);
    누적 += 컷들[i].초 - 겹침; 앞 = 나옴;
  }
  입력.push("-i", 도장);
  거르기.push(`[${컷들.length}:v]format=rgba,colorchannelmixer=aa=0.92[도장]`, `[이은것][도장]overlay=x=40:y=64:format=auto[out]`);

  const 결과 = `${OUT}/두근도트-${c.name}.mp4`;
  execFileSync(FF, ["-y", ...입력, "-filter_complex", 거르기.join(";"), "-map", "[out]",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "21", "-r", String(FPS), "-movflags", "+faststart", 결과],
    { stdio: ["ignore", "ignore", "pipe"] });
  const ffprobe = (await import("ffprobe-static")).default as unknown as { path: string };
  const j = JSON.parse(execFileSync(ffprobe.path, ["-v", "quiet", "-print_format", "json", "-show_format", 결과]).toString()) as { format: { duration: string; size: string } };
  const 길이 = Number(j.format.duration);
  console.log(`${c.name.padEnd(4)} ${길이.toFixed(1)}초 (기대 ${누적.toFixed(1)}) ${Math.abs(길이 - 누적) < 1 ? "맞음" : "**틀림**"} · ${(Number(j.format.size) / 1048576).toFixed(1)}MB → ${결과}`);
}
