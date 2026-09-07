import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * 영상 조립 (39회차 09-07). 장면마다 그림 한 장 + 목소리 한 토막 → 장면 클립 → 이어 붙임 → mp4.
 * 모델이 없는 순수 배관이라 로컬에서 먼저 시험한다(`engine/tools/video_assemble_test.mts`).
 * ffmpeg 는 `ffmpeg-static`(플랫폼별 정적 바이너리) — 로컬(Windows)과 Railway(Linux) 둘 다 같은 코드.
 * 자막은 SRT 사이드카로 낸다(글자를 영상에 굽는 drawtext 는 글꼴 파일이 필요해 서버마다 다르다).
 */
const run = promisify(execFile);
const FFMPEG = ffmpegPath as unknown as string;
const FFPROBE = (ffprobeStatic as unknown as { path: string }).path;

export type Scene = { image: Uint8Array; audio: Uint8Array; caption: string };
export type Assembled = { mp4: Buffer; srt: string; durations: number[]; total: number; first5s: Buffer; mid: Buffer; hasAudio: boolean };

export async function probeDuration(file: string): Promise<number> {
  const { stdout } = await run(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  return Number(stdout.toString().trim()) || 0;
}

export async function probeHasAudio(file: string): Promise<boolean> {
  const { stdout } = await run(FFPROBE, ["-v", "error", "-select_streams", "a", "-show_entries", "stream=codec_type", "-of", "csv=p=0", file]);
  return stdout.toString().includes("audio");
}

function srtTime(sec: number): string {
  const ms = Math.round(sec * 1000);
  const h = Math.floor(ms / 3_600_000), m = Math.floor((ms % 3_600_000) / 60_000), s = Math.floor((ms % 60_000) / 1000), r = ms % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(r).padStart(3, "0")}`;
}

export async function assemble(scenes: Scene[], opts: { width?: number; height?: number; padSec?: number } = {}): Promise<Assembled> {
  const W = opts.width ?? 1280, H = opts.height ?? 720, pad = opts.padSec ?? 0.4;
  const dir = await mkdtemp(path.join(tmpdir(), "rookery-video-"));
  try {
    const durations: number[] = [];
    const list: string[] = [];
    for (let i = 0; i < scenes.length; i++) {
      const img = path.join(dir, `s${i}.png`), aud = path.join(dir, `s${i}.mp3`), seg = path.join(dir, `seg${i}.mp4`);
      await writeFile(img, scenes[i].image);
      await writeFile(aud, scenes[i].audio);
      const d = Math.max(1.5, (await probeDuration(aud)) + pad);
      durations.push(d);
      await run(FFMPEG, [
        "-y", "-loop", "1", "-framerate", "30", "-i", img, "-i", aud,
        "-vf", `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},format=yuv420p`,
        "-c:v", "libx264", "-tune", "stillimage", "-preset", "veryfast", "-r", "30",
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
    let t = 0;
    const srt = scenes.map((s, i) => { const a = t; t += durations[i]; return `${i + 1}\n${srtTime(a)} --> ${srtTime(t)}\n${s.caption}\n`; }).join("\n");
    return { mp4: await readFile(out), srt, durations, total, first5s: await readFile(first), mid: await readFile(mid), hasAudio };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
