/**
 * **릴스 3판 — 어지럽게** (227회차 09-29, 사장님 "효과 추가 해봐 어지럽게"). 값 0 · 모델 0.
 *
 *   npx tsx engine/tools/dot_reel3.mts
 *
 * 2판 장면(`장면2/`)을 그대로 쓰고 **효과만** 더 얹는다 — 화면을 다시 찍거나 대화를 다시 돌리지 않는다.
 *
 * 얹는 것 다섯:
 *  ① **흔들림** — 화면이 미세하게 떨린다(손으로 든 것처럼). `crop` 자리를 sin/cos 으로 흔든다.
 *  ② **기울임** — 아주 조금 좌우로 기울며 돈다. 크게 잡아 놓고 가운데만 잘라 모서리를 감춘다.
 *  ③ **색 튐** — 장면 몇 개에 `hue` 를 흔들고 `rgbashift` 로 빨강·파랑을 어긋내 글리치 느낌을 낸다.
 *  ④ **번쩍임** — 컷이 바뀔 때 흰색으로 확 터진다(`fadewhite`). 어지러운 느낌의 절반은 여기서 온다.
 *  ⑤ **더 짧은 컷** — 2.2초 → 1.6초. 컷이 짧으면 그 자체로 정신없다.
 *
 * **지나치면 안 보인다.** 대화 화면(말풍선을 읽어야 하는 컷)은 흔들림을 약하게, 색 튐은 안 넣는다 —
 * 광고가 어지러운 것과 **무엇을 파는지 안 보이는 것**은 다르다.
 */
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import ffmpegPath from "ffmpeg-static";

const OUT = "C:/Users/az518/Desktop/두근도트-영상";
const 칸 = `${OUT}/장면2`;
const W = 1080, H = 1920, FPS = 30, 겹침 = 0.3;
const 큰W = Math.round(W * 1.16), 큰H = Math.round(H * 1.16);   // 흔들고 기울일 여유

type 컷 = {
  카드: string; 글자?: string; 초: number;
  움직임: "들어가기" | "나오기" | "오른쪽" | "아래로";
  흔들기: number;      // 흔들리는 폭(px). 0 이면 안 흔든다
  기울기: number;      // 라디안. 0 이면 안 기운다
  색튐: boolean;
  전환: string;
};

// 2판이 남긴 이름이 카드와 글자층이 한 칸씩 어긋나 있다 — 짐작하지 말고 **그대로 적는다**.
const 컷들: 컷[] = [
  { 카드: "01.png", 글자: "02-글.png", 초: 1.6, 움직임: "들어가기", 흔들기: 10, 기울기: 0.020, 색튐: true, 전환: "fadewhite" },
  { 카드: "02.png", 글자: "03-글.png", 초: 1.6, 움직임: "나오기", 흔들기: 10, 기울기: 0.018, 색튐: true, 전환: "pixelize" },
  { 카드: "03.png", 글자: "04-글.png", 초: 1.6, 움직임: "오른쪽", 흔들기: 12, 기울기: 0.022, 색튐: true, 전환: "fadewhite" },
  { 카드: "04.png", 초: 1.7, 움직임: "아래로", 흔들기: 7, 기울기: 0.010, 색튐: false, 전환: "zoomin" },
  // 대화 화면 — 여기서만 얌전하다. 말풍선을 읽어야 하니까.
  { 카드: "05.png", 초: 2.8, 움직임: "아래로", 흔들기: 3, 기울기: 0.004, 색튐: false, 전환: "circleopen" },
  { 카드: "06.png", 초: 1.7, 움직임: "들어가기", 흔들기: 8, 기울기: 0.012, 색튐: false, 전환: "hlslice" },
  { 카드: "07.png", 초: 1.7, 움직임: "아래로", 흔들기: 8, 기울기: 0.012, 색튐: true, 전환: "fadewhite" },
  { 카드: "08.png", 초: 2.4, 움직임: "들어가기", 흔들기: 5, 기울기: 0.006, 색튐: false, 전환: "" },
];

const FF = ffmpegPath as unknown as string;
if (!FF || !existsSync(FF)) { console.error("ffmpeg 을 못 찾았다"); process.exit(1); }
for (const c of 컷들) {
  for (const f of [c.카드, c.글자]) if (f && !existsSync(`${칸}/${f}`)) { console.error(`장면이 없다: ${f}`); process.exit(1); }
}

/**
 * **아이콘을 영상에 얹는다** (사장님 "지금 그냥 프로필도 붙여" · "아이콘 말하는거야").
 *
 * 릴스는 퍼 나르기가 쉬워서 **어디서 온 영상인지**가 화면에 없으면 앱을 못 찾는다.
 * 앱 아이콘과 **같은 그림**(말풍선+하트)이라야 스토어에서 알아본다.
 * 흔들림·기울임은 장면에만 걸고 **아이콘은 안 흔든다** — 같이 떨면 읽히지 않는다.
 */
const 도장 = `${칸}/_도장.png`;
{
  const 칸수 = 16, 그림 = [
    "................", "................",
    "..############..", ".##############.",
    ".#####@@##@@###.", ".####@@@@@@@@##.",
    ".####@@@@@@@@##.", ".####@@@@@@@@##.",
    ".#####@@@@@@###.", ".######@@@@####.",
    "..######@@####..", "...##...........",
    "...##...........", "..##............",
    "................", "................",
  ];
  const buf = Buffer.alloc(칸수 * 칸수 * 4);
  for (let y = 0; y < 칸수; y++) for (let x = 0; x < 칸수; x++) {
    const p = (y * 칸수 + x) * 4;
    if ((그림[y][x]) === "#") { buf[p] = 255; buf[p + 1] = 255; buf[p + 2] = 255; buf[p + 3] = 255; }
  }
  const 아이콘크기 = 104, 속 = Math.round(아이콘크기 * 0.62);
  const 말풍선 = await sharp(buf, { raw: { width: 칸수, height: 칸수, channels: 4 } })
    .resize(속, 속, { kernel: "nearest" }).png().toBuffer();
  const 동그라미 = await sharp({ create: { width: 아이콘크기, height: 아이콘크기, channels: 4, background: { r: 255, g: 92, b: 122, alpha: 1 } } })
    .composite([
      { input: 말풍선, left: Math.round((아이콘크기 - 속) / 2), top: Math.round((아이콘크기 - 속) / 2) },
      { input: Buffer.from(`<svg width="${아이콘크기}" height="${아이콘크기}"><circle cx="${아이콘크기 / 2}" cy="${아이콘크기 / 2}" r="${아이콘크기 / 2}" fill="#fff"/></svg>`), blend: "dest-in" },
    ]).png().toBuffer();
  const 폭 = 420, 높 = 128;
  const 판 = await sharp({ create: { width: 폭, height: 높, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      { input: 동그라미, left: 8, top: 12 },
      { input: Buffer.from(`<svg width="${폭}" height="${높}" xmlns="http://www.w3.org/2000/svg">
          <text x="128" y="78" font-family="Malgun Gothic, sans-serif" font-size="44" font-weight="800" fill="#fff"
            style="paint-order:stroke" stroke="#0b0f14" stroke-width="7" stroke-opacity="0.75">두근도트</text>
        </svg>`) },
    ]).png().toBuffer();
  writeFileSync(도장, 판);
  console.log("도장(아이콘+이름) 만듦");
}

const 입력: string[] = [], 거르기: string[] = [];
const 번호 = new Map<number, { 카드: number; 글자?: number }>();
let 번 = 0;
컷들.forEach((c, i) => {
  입력.push("-i", `${칸}/${c.카드}`); const a = 번++;
  let g: number | undefined;
  if (c.글자) { 입력.push("-i", `${칸}/${c.글자}`); g = 번++; }
  번호.set(i, { 카드: a, 글자: g });
});

컷들.forEach((c, i) => {
  const { 카드, 글자 } = 번호.get(i)!;
  const d = Math.round(c.초 * FPS);
  const cx = "iw/2-(iw/zoom/2)", cy = "ih/2-(ih/zoom/2)";
  const m = c.움직임 === "들어가기" ? { z: "min(1.0+0.005*on,1.35)", x: cx, y: cy }
    : c.움직임 === "나오기" ? { z: "max(1.35-0.005*on,1.0)", x: cx, y: cy }
    : c.움직임 === "오른쪽" ? { z: "1.26", x: `(iw-iw/zoom)*on/${d}`, y: cy }
    : { z: "1.26", x: cx, y: `(ih-ih/zoom)*on/${d}` };

  const 줄 = [
    `scale=${Math.round(W * 1.5)}:${Math.round(H * 1.5)}`,
    `zoompan=z='${m.z}':d=${d}:x='${m.x}':y='${m.y}':s=${큰W}x${큰H}:fps=${FPS}`,
  ];
  // ② 기울임 — 크게 잡은 판에서 돌려야 모서리가 안 보인다
  if (c.기울기 > 0) 줄.push(`rotate=a='${c.기울기}*sin(t*7)':ow=iw:oh=ih:c=black@0`);
  // ③ 색 튐
  if (c.색튐) { 줄.push(`hue=h='9*sin(t*5)'`); 줄.push(`rgbashift=rh=5:bh=-5`); }
  // ① 흔들림 — 가운데를 잘라 내되 자리를 떤다
  줄.push(`crop=${W}:${H}:x='(iw-${W})/2+${c.흔들기}*sin(t*31)':y='(ih-${H})/2+${c.흔들기}*cos(t*27)'`);
  줄.push("setsar=1", "format=yuv420p");
  거르기.push(`[${카드}:v]${줄.join(",")}[b${i}]`);

  if (글자 !== undefined) {
    거르기.push(`[${글자}:v]scale=${W}:${H},setsar=1,format=rgba[t${i}]`);
    // 글자는 더 빨리 튀어 들어온다(컷이 짧아졌으니 0.55초는 늦다)
    거르기.push(`[b${i}][t${i}]overlay=x=0:y='if(lt(t,0.35),H,50*max(0,1-(t-0.35)*6))':enable='gte(t,0.35)':format=auto[v${i}]`);
  } else {
    거르기.push(`[b${i}]null[v${i}]`);
  }
});

let 앞 = "[v0]", 누적 = 컷들[0].초;
for (let i = 1; i < 컷들.length; i++) {
  const 나옴 = i === 컷들.length - 1 ? "[이은것]" : `[x${i}]`;
  거르기.push(`${앞}[v${i}]xfade=transition=${컷들[i - 1].전환 || "fade"}:duration=${겹침}:offset=${(누적 - 겹침).toFixed(3)}${나옴}`);
  누적 = 누적 + 컷들[i].초 - 겹침;
  앞 = 나옴;
}

// 도장은 **다 이은 뒤에** 한 번만 얹는다 — 컷마다 얹으면 전환할 때 같이 밀려 들어가 어지럽다.
입력.push("-i", 도장);
const 도장번 = 번++;
거르기.push(`[${도장번}:v]format=rgba,colorchannelmixer=aa=0.92[도장]`);
거르기.push(`[이은것][도장]overlay=x=40:y=64:format=auto[out]`);

const 결과 = `${OUT}/두근도트-릴스3.mp4`;
console.log(`컷 ${컷들.length}개 · 기대 길이 ${누적.toFixed(1)}초`);
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
