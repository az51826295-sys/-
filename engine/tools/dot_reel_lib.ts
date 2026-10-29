/**
 * **릴스 공용 조각** (10-29). 값 0 · 모델 0.
 *
 * 10-29 에 영어 릴스를 두 편 만들면서, 세 번째 편을 또 복사해 쓰려다 멈췄다.
 * 복사하면 **고친 것이 한쪽에만 남는다** — 훅 글자가 화면 밖으로 잘리던 것을
 * 한 편에서만 고치면 다음 편에서 또 잘린다.
 *
 * **내보내는 이름은 ASCII 로 둔다.** 한글 export 는 tsx 가 조용히 흘려서
 * 부르는 쪽이 `undefined` 를 받는다([[ascii-export-names]]). 안쪽 말은 한국어 그대로다.
 */
import sharp from "sharp";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import ffmpegPath from "ffmpeg-static";

export const W = 1080, H = 1920, FPS = 30, XFADE = 0.25;
/** 영어 글은 영어 글꼴로. 한글 글꼴로 영어를 쓰면 자간이 어색하다. */
export const FONT = "Segoe UI, Arial, Helvetica, sans-serif";
export const PINK = "#ff5c7a", NIGHT = "#0b0f14";

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const text = (x: number, y: number, s: string, size: number, color: string, weight = 800, stroke = 12) =>
  `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="middle"
     style="paint-order:stroke" stroke="#0b0f14" stroke-width="${stroke}">${esc(s)}</text>`;

/** 긴 문장을 폭에 맞게 줄로 가른다 — 한 줄로 두면 글자가 작아져 못 읽는다. */
export function wrap(s: string, per: number): string[] {
  const out: string[] = [];
  let now = "";
  for (const w of s.split(/\s+/)) {
    if ((now + " " + w).trim().length > per && now) { out.push(now); now = w; }
    else now = (now + " " + w).trim();
  }
  if (now) out.push(now);
  return out;
}

/**
 * **잘리지 않는 크기**로 글 뭉치를 그린다.
 *
 * 확대가 1.2배까지 가므로 실제로 보이는 폭은 1080/1.2 = 900px 이다.
 * 10-29 첫 판에서 92px × 19자 짜리 첫 줄이 화면 밖으로 잘렸다 — 눈으로 고르면
 * 다음에 긴 말이 오면 또 잘린다. 그래서 **제일 긴 줄에 맞춰 줄인다.**
 */
export function fitLines(s: string, opts: { per?: number; max?: number; min?: number; budget?: number } = {}) {
  const per = opts.per ?? 20, max = opts.max ?? 92, min = opts.min ?? 46, budget = opts.budget ?? 780;
  const lines = wrap(s, per);
  const longest = Math.max(...lines.map((l) => l.length));
  const size = Math.max(min, Math.min(max, Math.floor(budget / (longest * 0.52))));
  return { lines, size };
}

/** 전신 스프라이트 한 장을 화면 가운데에. 도트는 `nearest` 로 키운다(뭉개면 도트가 아니다). */
export async function bodyCard(sprite: string, bg: string, svg: string, size = 900, lift = 140): Promise<Buffer> {
  const art = await sharp(sprite).resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: "nearest" }).png().toBuffer();
  const base = await sharp({ create: { width: W, height: H, channels: 4, background: bg } }).png().toBuffer();
  return sharp(base).composite([
    { input: art, left: Math.round((W - size) / 2), top: Math.round((H - size) / 2) - lift },
    { input: Buffer.from(svg) },
  ]).png().toBuffer();
}

export type Cut = { 파일: string; 초: number; 움직임: "들어가기" | "나오기" | "훑기"; 전환: string };

/** 컷을 이어 붙여 mp4 하나로. 돌려주는 것: 기대 길이(초). */
export function stitch(cuts: Cut[], out: string): number {
  const FF = ffmpegPath as unknown as string;
  if (!FF || !existsSync(FF)) throw new Error("ffmpeg 을 못 찾았다");
  const inputs: string[] = [], filters: string[] = [];
  const bigW = Math.round(W * 1.1), bigH = Math.round(H * 1.1);
  cuts.forEach((k, i) => {
    inputs.push("-i", k.파일);
    const d = Math.round(k.초 * FPS), cx = "iw/2-(iw/zoom/2)", cy = "ih/2-(ih/zoom/2)";
    const m = k.움직임 === "훑기" ? { z: "1.14", x: cx, y: `ih/2-(ih/zoom/2)+${Math.round(H * 0.06)}*on/${d}` }
      : k.움직임 === "들어가기" ? { z: "min(1.0+0.003*on,1.2)", x: cx, y: cy }
      : { z: "max(1.2-0.003*on,1.0)", x: cx, y: cy };
    /* 읽어야 하는 화면은 **흔들지 않는다** — 광고가 어지러운 것과 무엇을 파는지 안 보이는 것은 다르다. */
    const shake = k.움직임 === "훑기" ? `crop=${W}:${H}:x='(iw-${W})/2':y='(ih-${H})/2'`
      : `crop=${W}:${H}:x='(iw-${W})/2+5*sin(t*25)':y='(ih-${H})/2+5*cos(t*21)'`;
    filters.push(`[${i}:v]scale=${Math.round(W * 1.3)}:${Math.round(H * 1.3)},zoompan=z='${m.z}':d=${d}:x='${m.x}':y='${m.y}':s=${bigW}x${bigH}:fps=${FPS},` +
      `${shake},setsar=1,format=yuv420p[v${i}]`);
  });
  let prev = "[v0]", total = cuts[0].초;
  for (let i = 1; i < cuts.length; i++) {
    const outPad = i === cuts.length - 1 ? "[out]" : `[x${i}]`;
    filters.push(`${prev}[v${i}]xfade=transition=${cuts[i - 1].전환 || "fade"}:duration=${XFADE}:offset=${(total - XFADE).toFixed(3)}${outPad}`);
    total += cuts[i].초 - XFADE; prev = outPad;
  }
  execFileSync(FF, ["-y", ...inputs, "-filter_complex", filters.join(";"), "-map", "[out]",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "21", "-r", String(FPS), "-movflags", "+faststart", out],
    { stdio: ["ignore", "ignore", "pipe"] });
  return total;
}

/** 나온 영상을 **재서** 찍어 준다. 돌려주는 것: 어긋난 개수. */
export async function measure(out: string, expect: number, extra: [string, boolean | null, string][] = []): Promise<number> {
  const ffprobe = (await import("ffprobe-static")).default as unknown as { path: string };
  const j = JSON.parse(execFileSync(ffprobe.path, ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", out]).toString()) as
    { format: { duration: string; size: string }; streams: { width?: number; height?: number }[] };
  const len = Number(j.format.duration), v = j.streams.find((s) => s.width);
  const rows: [string, boolean | null, string][] = [
    ["길이가 기대와 맞나", Math.abs(len - expect) < 1, `${len.toFixed(1)}초 (기대 ${expect.toFixed(1)})`],
    ["릴스 길이(8~20초)", len >= 8 && len <= 20, `${len.toFixed(1)}초`],
    ["세로 9:16", v?.width === W && v?.height === H, `${v?.width}x${v?.height}`],
    ["20MB 아래", Number(j.format.size) / 1048576 < 20, `${(Number(j.format.size) / 1048576).toFixed(1)}MB`],
    ...extra,
  ];
  console.log();
  for (const [n, ok, got] of rows) console.log(`${ok === null ? "못 잼 " : ok ? "맞음  " : "**어긋남**"} ${n} — ${got}`);
  const bad = rows.filter((r) => r[1] === false).length;
  console.log(`\n${rows.filter((r) => r[1] === true).length}/${rows.length} → ${out}`);
  return bad;
}
