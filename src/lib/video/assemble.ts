import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { safeLook, type Look } from "./look";

/**
 * 영상 조립 (39회차 09-07). 장면마다 그림 한 장 + 목소리 한 토막 → 장면 클립 → 이어 붙임 → mp4.
 * 모델이 없는 순수 배관이라 로컬에서 먼저 시험한다(`engine/tools/video_assemble_test.mts`).
 * ffmpeg 는 `ffmpeg-static`(플랫폼별 정적 바이너리) — 로컬(Windows)과 Railway(Linux) 둘 다 같은 코드.
 * 자막은 SRT 사이드카로 낸다(글자를 영상에 굽는 drawtext 는 글꼴 파일이 필요해 서버마다 다르다).
 */
const runRaw = promisify(execFile);
// 111회차 09-14: execFile 이 던지는 오류의 message 는 "Command failed: <명령 전체>" 라 DB 의 error_message(500자) 안에 **명령만** 남고
// ffmpeg 가 왜 죽었는지(stderr)는 잘려 나갔다 — 시험판 영상 4/4 실패의 원인을 서버에서 읽을 수 없었다. stderr 끝을 앞에 세운다.
const run: typeof runRaw = (async (file: string, args: readonly string[]) => {
  try { return await runRaw(file, args as string[], { maxBuffer: 16 * 1024 * 1024 }); }
  catch (e) {
    const err = e as Error & { stderr?: string };
    const tail = String(err.stderr ?? "").trim().split("\n").filter(Boolean).slice(-4).join(" | ").slice(-300);
    throw new Error(`ffmpeg: ${tail || err.message.slice(0, 200)} — ${String(file).split(/[\\/]/).pop()} ${args.slice(0, 3).join(" ")}…`);
  }
}) as typeof runRaw;
// 111회차 09-14: Railway 의 ffmpeg-static(리눅스 정적 바이너리)에는 drawtext 필터가 **없다**("No such filter: 'drawtext'") —
// 시험판 영상 4/4 가 그렇게 죽었다. 서버엔 nixpacks 로 ffmpeg-full 을 깔고(nixpacks.toml), 시스템 ffmpeg 가 있으면 그걸 먼저 쓴다.
// 로컬(Windows)엔 시스템 ffmpeg 가 없어 정적 바이너리 그대로(gyan.dev 빌드, drawtext 있음).
function onPath(name: string): string | null {
  if (process.platform === "win32") return null;
  for (const dir of (process.env.PATH ?? "").split(":")) {
    const p = path.join(dir, name);
    try { if (existsSync(p)) return p; } catch { /* 다음 */ }
  }
  return null;
}
/** nix 로 깐 ffmpeg 는 PATH 에 안 실릴 수 있다 — /nix/store 를 직접 뒤진다. */
function inNixStore(name: string): string[] {
  try {
    return readdirSync("/nix/store").filter((d) => d.includes("ffmpeg")).map((d) => path.join("/nix/store", d, "bin", name)).filter((p) => existsSync(p));
  } catch { return []; }
}
/** 3판(23:36 KST): nixpacks 의 ffmpeg-full 도 실행 이미지에 없었다(후보가 정적 하나뿐). 리눅스에서 drawtext 가 있는 빌드를 npm 으로
 *  하나 더 들고 다닌다 — `@ffmpeg-installer/ffmpeg`(johnvansickle 4.1 정적, libfreetype 포함). 어느 쪽이든 drawtext 있는 쪽을 고른다. */
function installerFfmpeg(): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const inst = require("@ffmpeg-installer/ffmpeg") as { path?: string };
    return inst.path && existsSync(inst.path) ? inst.path : null;
  } catch { return null; }
}
const candidates = (name: string, fallback: string): string[] =>
  [...new Set([process.env[`${name.toUpperCase()}_PATH`] ?? "", onPath(name) ?? "", ...inNixStore(name), fallback, ...(name === "ffmpeg" ? [installerFfmpeg() ?? ""] : [])].filter(Boolean))];

/** drawtext 가 실제로 있는 ffmpeg 를 고른다(처음 한 번 확인, 이후 기억). 2판(23:23 KST)에 시스템 ffmpeg 를 깔고도 또 죽어서 —
 *  어느 바이너리가 돌았는지 오류에 안 남았다. 고를 때 `-filters` 를 물어 drawtext 있는 쪽을 쓰고, 고른 경로를 남긴다. */
let picked: { ffmpeg: string; ffprobe: string } | null = null;
export async function bins(): Promise<{ ffmpeg: string; ffprobe: string }> {
  if (picked) return picked;
  const ffs = candidates("ffmpeg", ffmpegPath as unknown as string);
  let chosen = ffs[ffs.length - 1];
  const seen: string[] = [];
  for (const f of ffs) {
    try {
      const { stdout } = await runRaw(f, ["-hide_banner", "-filters"], { maxBuffer: 4 * 1024 * 1024 });
      const has = stdout.toString().includes(" drawtext ");
      seen.push(`${f}${has ? " (drawtext 있음)" : " (drawtext 없음)"}`);
      if (has) { chosen = f; break; }
    } catch (e) { seen.push(`${f} (실행 실패: ${e instanceof Error ? e.message.slice(0, 60) : e})`); }
  }
  const probes = candidates("ffprobe", (ffprobeStatic as unknown as { path: string }).path);
  // ffprobe 는 ffmpeg 와 같은 폴더 것을 우선 — 판이 다르면 이상하게 어긋난다.
  const sibling = path.join(path.dirname(chosen), "ffprobe");
  picked = { ffmpeg: chosen, ffprobe: existsSync(sibling) ? sibling : probes[probes.length - 1] };
  console.log(`[영상] ffmpeg 고름: ${picked.ffmpeg} · ffprobe: ${picked.ffprobe} · 후보: ${seen.join(" / ")}`);
  return picked;
}

export type Scene = {
  /** 없으면 **바탕색만** 깐다(글자 카드). 09-09: 생성 그림을 버린 판. */
  image?: Uint8Array;
  /**
   * 154회차 — **진짜 화면 녹화**. 사장님 "에휴 쓰레기".
   * 그때까지 이 배관의 그림은 글자 카드(단색 바탕) 아니면 정지 사진 한 장뿐이었다. 광고가 될 수 없는 재료다.
   * 이 칸이 있으면 그 장면은 **움직이는 화면 위에** 글을 얹는다(`video/screen.ts` 가 로키 자신을 찍어 온다).
   */
  clip?: Uint8Array;
  audio: Uint8Array;
  caption: string;
  /** 09-09: 화면에 **구워 넣을 글자.** 사장님이 첫 영상을 보고 "존나 별로" — 화면에 글자가 하나도 없었다.
   *  주문서에 "글자 크게" 라고 적었지만 아무도 안 지켰고, 그걸 재는 자도 없었다.
   *  검사로 잡지 않고 **구조로 막는다**: 대본의 글자를 ffmpeg 이 직접 그린다. 그러면 없을 수가 없다. */
  title?: string;
  lines?: string[];
  cite?: string;
  /** 217회차 09-25: 대본이 이 장면에 준 초. 14일 19장면 중 18개가 계획보다 **짧게** 나왔다(말이 계획보다 짧음) —
   *  장면 길이의 바닥으로 삼는다(최대 +2초까지만 채움). 계획은 대본의 리듬이고, 자 '장면_계획_대비' 가 재는 것도 이것이다. */
  planSec?: number;
};
export type Assembled = { padUsed: number; audioSec: number[]; mp4: Buffer; srt: string; durations: number[]; total: number; first5s: Buffer; mid: Buffer; /** 장면마다 한가운데에서 한 장 — 경계 인식 고르기(133회차). */ shots: Buffer[]; hasAudio: boolean };

export async function probeDuration(file: string): Promise<number> {
  const { ffprobe: FFPROBE } = await bins();
  const { stdout } = await run(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  return Number(stdout.toString().trim()) || 0;
}

export async function probeHasAudio(file: string): Promise<boolean> {
  const { ffprobe: FFPROBE } = await bins();
  const { stdout } = await run(FFPROBE, ["-v", "error", "-select_streams", "a", "-show_entries", "stream=codec_type", "-of", "csv=p=0", file]);
  return stdout.toString().includes("audio");
}

function srtTime(sec: number): string {
  const ms = Math.round(sec * 1000);
  const h = Math.floor(ms / 3_600_000), m = Math.floor((ms % 3_600_000) / 60_000), s = Math.floor((ms % 60_000) / 1000), r = ms % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(r).padStart(3, "0")}`;
}


/** ffmpeg drawtext 한 줄. 글꼴은 **저장소에 넣은 것**을 쓴다 — 서버마다 다른 글꼴을 찾아 헤매지 않는다. */
// **147회차: 굵은 글씨가 한 번도 나온 적이 없었다.** NotoSansKR.ttf 는 `fvar` 가 있는 **가변 글꼴**인데
// drawtext 는 얼굴 번호 0 을 박아 부르므로 FreeType 이 이름 붙은 굵기를 무시한다(굵기 인자 자체가 없다).
// 그래서 제목도 본문도 늘 Regular 400 이었고, 남은 위계가 크기뿐이라 "기본값 같다" 는 인상이 여기서 나왔다.
// 재서 확인: 같은 글 같은 크기에 글자 픽셀 **2,406(가변) 대 8,116(정적 Bold)** — 3.4배.
// fontTools 로 wght=700·400 을 정적 파일로 떠서 제목은 Bold, 본문은 Regular 를 쓴다.
const FONT_DIR = path.join(process.cwd(), "assets", "fonts");
const FONT = path.join(FONT_DIR, "NotoSansKR-Regular.ttf");
const FONT_BOLD = path.join(FONT_DIR, "NotoSansKR-Bold.ttf");
function esc(t: string): string {
  // 09-09: 한 겹만 벗긴다. 두 겹으로 넣었더니 ffmpeg 이 콜론 뒤를 통째로 잘라 먹었다
  // ("OWASP Top 10:2021, p.10" → "OWASP Top 10" + 백슬래시). execFile 이라 셸은 없다 — 필터 문법만 피하면 된다.
  //
  // **147회차 09-16: `%` 를 벗기면 그 줄이 통째로 안 그려진다.** 재서 확인했다 —
  // 지금 방식으로 '기업의 72%가 도입' 을 그리면 밝은 픽셀 **0개**, `expansion=none` 으로 넣으면 **1,808개**.
  // 오류도 안 난다(exit 0). stderr 에 `Stray % near …` 한 줄만 남고 화면은 그냥 빈다.
  // 설명 영상의 본문은 대개 통계라 **언제 터져도 이상하지 않은 지뢰**였다(다행히 지금까지 101 장면 중 0건).
  // 이제 `expansion=none` 이라 ffmpeg 이 `%` 와 역슬래시를 해석하지 않는다 — 그래서 그 둘은 벗기지 않는다.
  // 덤으로 모델이 쓴 글의 이상한 토큰이 필터 문법으로 새는 길도 같이 막힌다.
  return t
    .replace(/:/g, "\\:")
    .replace(/'/g, "\u2019");
}
function drawText(
  text: string, y: number, size: number, color: string, bold = false,
  // 149회차: 정렬도 판마다 다르다. 왼쪽 정렬은 읽을 거리가 있을 때 눈이 시작점을 찾기 쉽다.
  align: "center" | "left" = "center", width = 1280,
  anim?: { at?: number; rise?: number; fade?: number; drift?: number },
): string {
  // 윈도우 경로의 드라이브 콜론(C:)도 필터 문법이라 한 번 벗겨 준다.
  const f = (bold ? FONT_BOLD : FONT).replace(/\\/g, "/").replace(/:/g, "\\:");
  const at = anim?.at ?? 0, rise = anim?.rise ?? 0, fade = anim?.fade ?? 0, drift = anim?.drift ?? 0;
  const yExpr = rise > 0 || drift > 0
    ? `'${y}${rise > 0 ? `+${rise}*(1-min(1,max(0,(t-${at.toFixed(2)})/0.45)))` : ""}${drift > 0 ? `-${drift}*t` : ""}'`
    : String(y);
  const alpha = fade > 0 ? `:alpha='min(1,max(0,(t-${at.toFixed(2)})/${fade.toFixed(2)}))'` : "";
  return `drawtext=fontfile='${f}':text='${esc(text)}':expansion=none:fontcolor=${color}:fontsize=${size}:x=${align === "left" ? Math.round(width * 0.075) : "(w-text_w)/2"}:y=${yExpr}${alpha}:shadowcolor=black@0.8:shadowx=2:shadowy=2`;
}

export async function assemble(
  scenes: Scene[],
  // 149회차: `look` 이 없으면 예전과 똑같이 돈다(기본값이 옛 상수다). 있으면 **그 판의 연출**을 따른다.
  opts: { width?: number; height?: number; padSec?: number; look?: Partial<Look> | null; fitSec?: number } = {},
): Promise<Assembled> {
  const W = opts.width ?? 1280, H = opts.height ?? 720;
  const look = safeLook(opts.look);
  let pad = opts.padSec ?? look.pad;
  const { ffmpeg: FFMPEG } = await bins();
  const dir = await mkdtemp(path.join(tmpdir(), "rookery-video-"));
  try {
    const durations: number[] = [];
    /**
     * 158회차 — **주문이 말한 길이는 계약이다.** 15초 주문에 19초가 나왔다(154회차). 장면 수·말 길이는 대본이 정하고(판단),
     * 여기서는 **쉼(pad)만** 줄여서 맞춘다 — 목소리는 자르지 않는다(그건 뜻을 자르는 것). 쉼은 0.15초 밑으로는 안 내려간다(난간).
     * 그래도 안 맞으면 안 맞는 대로 낸다 — 그 사실은 `주문_길이_지킴` 이 적는다.
     */
    const audioSec: number[] = [];
    for (let i = 0; i < scenes.length; i++) {
      const aud = path.join(dir, `s${i}.mp3`);
      await writeFile(aud, scenes[i].audio);
      audioSec.push(await probeDuration(aud));
    }
    if (opts.fitSec && scenes.length) {
      const room = (opts.fitSec - audioSec.reduce((x, y) => x + y, 0)) / scenes.length;
      const fitted = Math.max(0.15, Math.min(pad, room));
      if (fitted < pad) { console.log(`[video] 주문 ${opts.fitSec}s 에 맞춰 쉼 ${pad.toFixed(2)} → ${fitted.toFixed(2)}s`); pad = fitted; }
    }
    const list: string[] = [];
    for (let i = 0; i < scenes.length; i++) {
      const img = path.join(dir, `s${i}.png`), aud = path.join(dir, `s${i}.mp3`), seg = path.join(dir, `seg${i}.mp4`);
      const sc = scenes[i];
      const hasClip = !!sc.clip && sc.clip.length > 0;
      const hasImage = !hasClip && !!sc.image && sc.image.length > 0;
      const clipFile = path.join(dir, `c${i}.mp4`);
      if (hasClip) await writeFile(clipFile, sc.clip as Uint8Array);
      if (hasImage) await writeFile(img, sc.image as Uint8Array);
      await writeFile(aud, sc.audio);
      const floor = scenes[i].planSec && Number.isFinite(scenes[i].planSec) ? Math.min(scenes[i].planSec as number, audioSec[i] + pad + 2) : 0;
      const d = Math.max(1.5, audioSec[i] + pad, floor);
      durations.push(d);
      /**
       * 153회차 — **움직임**. 사장님 "? 연출은?"
       * 149회차의 연출은 글자 크기·색이었고, 화면은 정지 그림을 하드컷으로 이은 것이었다(움직임 0).
       * 여기가 그 빈칸이다: `rise` 면 아래서 살짝 올라오며 나타나고, `drift` 면 장면 내내 아주 느리게 흐른다.
       * 어떤 값이 와도 화면은 나온다 — 그래서 맡겨도 되는 칸이다(149회차와 같은 기준).
       */
      const anim = (at: number) =>
        look.motion === "none"
          ? { at, fade: 0.28 }
          : look.motion === "drift"
            ? { at, fade: 0.4, drift: Math.round(H * 0.012) }
            : { at, fade: 0.3, rise: Math.round(H * 0.035) };
      const vf = hasImage || hasClip ? [`scale=${W}:${H}:force_original_aspect_ratio=increase`, `crop=${W}:${H}`] : [];
      if (sc.title || (sc.lines && sc.lines.length) || sc.cite) {
        // 그림 위에 얹을 때만 바탕을 눌러 준다. 글자 카드는 이미 짙은 바탕이라 그럴 필요가 없다.
        // 움직이는 화면 위에는 더 옅게 깐다 — 광고에서 정작 보여 줄 것이 화면이라, 44% 를 덮으면 그게 안 보인다.
        if (hasClip) vf.push(`drawbox=x=0:y=0:w=${W}:h=${H}:color=black@0.34:t=fill`);
        else if (hasImage) vf.push(`drawbox=x=0:y=0:w=${W}:h=${H}:color=black@0.55:t=fill`);
        // ── 146회차 09-16: 자리를 다시 잡는다. 오늘 심판자가 같은 것을 하루 종일 짚었다.
        //   · "내용이 세로 17%~60%에 몰려 **아래 40%가 비었다**" — 제목이 17%, 본문이 38% 고정이라 그랬다.
        //   · "**왼쪽 파란 가로선이 제목·본문과 정렬이 안 맞는다**" — 제목은 가운데인데 줄만 왼쪽 12% 고정이었다.
        // 둘 다 자리 계산이 고정값이라 생긴 것이다. 이제 **덩어리 높이를 재서 화면 가운데**에 놓고,
        // 파란 줄도 같은 가운데 축에 건다. (자를 고친 게 아니라 만드는 쪽을 고쳤다 — 심판자는 그대로 둔다.)
        // 149회차: 여기 있던 0.085·0.052·0.082 는 **내가 한 번 정한 상수**였다. 이제 판마다 AI 가 정한다.
        const titleSize = Math.round(H * look.titleScale);
        const lineSize = Math.round(H * look.bodyScale);
        const lineStep = Math.round(lineSize * look.lineGap);
        const nLines = (sc.lines ?? []).length;
        const RULE_GAP = Math.round(H * 0.055);   // 제목 아래 ~ 파란 줄
        const BODY_GAP = Math.round(H * 0.075);   // 파란 줄 ~ 첫 본문 줄
        const blockH =
          (sc.title ? titleSize + RULE_GAP + 4 + BODY_GAP : 0) +
          (nLines ? nLines * lineStep - (lineStep - lineSize) : 0);
        // 눈은 정가운데보다 살짝 위를 '가운데'로 읽는다(광학 중심). 3% 올린다.
        let y = Math.round((H - blockH) / 2 - H * 0.03);
        if (sc.title) {
          vf.push(drawText(sc.title, y, titleSize, "white", true, look.align, W, anim(0)));
          y += titleSize + RULE_GAP;
          if (look.accentStyle === "rule") {
            const ruleW = Math.round(W * 0.07);
            const rx = look.align === "left" ? Math.round(W * 0.075) : Math.round((W - ruleW) / 2);
            vf.push(`drawbox=x=${rx}:y=${y}:w=${ruleW}:h=4:color=0x${look.accent}:t=fill`);
          }
          y += 4 + BODY_GAP;
        }
        (sc.lines ?? []).forEach((ln, k) => vf.push(drawText(ln, y + k * lineStep, lineSize, `0x${look.ink}`, false, look.align, W, anim(look.reveal === "line" ? 0.22 + k * 0.16 : 0.1))));
        if (sc.cite) vf.push(drawText(sc.cite, Math.round(H * 0.88), Math.round(H * 0.034), "0x8FA0AE", false, look.align, W));
      }
      // 153회차: 장면과 장면 사이. 하드컷만 있던 자리다 — xfade 는 시각 셈이 누적이라 어긋나기 쉬워,
      // 각 조각의 앞뒤를 짧게 여닫는 쪽으로 간다(붙이는 것은 그대로 concat).
      if (look.transition === "fade") {
        vf.push("fade=t=in:st=0:d=0.22");
        vf.push(`fade=t=out:st=${Math.max(0, d - 0.22).toFixed(2)}:d=0.22`);
      }
      vf.push("format=yuv420p");
      // 찍은 화면이 장면보다 짧으면 되감아 채운다 — 광고 한 컷이 재료 길이에 끌려다니면 안 된다.
      const vin = hasClip
        ? ["-stream_loop", "-1", "-i", clipFile]
        : hasImage
          ? ["-loop", "1", "-framerate", "30", "-i", img]
          : ["-f", "lavfi", "-i", `color=c=0x${look.bg}:s=${W}x${H}:r=30`];
      await run(FFMPEG, [
        "-y", ...vin, "-i", aud,
        "-vf", vf.join(","),
        "-c:v", "libx264", ...(hasClip ? [] : ["-tune", "stillimage"]), "-preset", "veryfast", "-r", "30",
        "-af", "apad", "-c:a", "aac", "-ar", "44100", "-ac", "2", "-b:a", "128k",
        "-t", d.toFixed(2), "-movflags", "+faststart", seg,
      ]);
      list.push(`file '${seg.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`);
    }
    const listFile = path.join(dir, "list.txt");
    await writeFile(listFile, list.join("\n") + "\n");
    const out = path.join(dir, "out.mp4");
    await run(FFMPEG, ["-y", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", "-movflags", "+faststart", out]);
    const total = await probeDuration(out);
    const hasAudio = await probeHasAudio(out);
    const first = path.join(dir, "first5s.png"), mid = path.join(dir, "mid.png");
    await run(FFMPEG, ["-y", "-ss", Math.min(2.5, total / 2).toFixed(2), "-i", out, "-frames:v", "1", first]);
    await run(FFMPEG, ["-y", "-ss", (total / 2).toFixed(2), "-i", out, "-frames:v", "1", mid]);

    // ── 장면마다 한 장 (133회차 09-16) ──
    //
    // 붙는 사진 둘(첫 5초·가운데)은 **균등하게 뜬 것**이라, 장면이 다섯이면 셋은 아무도 안 본다.
    // 09-16 에 찾아본 것: 영상을 보는 모델에서 **경계 인식 고르기가 균등 고르기를 이긴다** —
    // 그리고 **프레임 예산이 적을수록 차이가 크다**(+1.2~5.5%p, 적은 예산에서 특히). 우리가 딱 그 경우다(심판자에게 5장까지).
    //
    // 남들은 장면 경계를 **모델로 찾아야** 하지만 **우리는 그냥 안다** — 이 영상을 우리가 장면 단위로 지었고
    // `durations` 가 경계다. 그래서 그 기술을 값 0에 쓴다: 장면마다 **한가운데**에서 한 장(대표 프레임).
    const shots: Buffer[] = [];
    let acc = 0;
    for (const d of durations) {
      const at = acc + d / 2; acc += d;
      const p = path.join(dir, `shot_${shots.length}.png`);
      try {
        await run(FFMPEG, ["-y", "-ss", at.toFixed(2), "-i", out, "-frames:v", "1", p]);
        shots.push(await readFile(p));
      } catch { /* 한 장 못 떠도 영상은 나간다 */ }
    }

    let t = 0;
    const srt = scenes.map((s, i) => { const a = t; t += durations[i]; return `${i + 1}\n${srtTime(a)} --> ${srtTime(t)}\n${s.caption}\n`; }).join("\n");
    return { padUsed: pad, audioSec, mp4: await readFile(out), srt, durations, total, first5s: await readFile(first), mid: await readFile(mid), shots, hasAudio };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
