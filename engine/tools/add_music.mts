/**
 * **이미 만든 영상에 음악만 얹는다** (226회차 2026-09-26).
 *
 * 15초 광고 한 판이 $2 인데 그중 $1.8 이 화면이다. 음악만 빠졌다고 전부 다시 사는 것은 낭비라,
 * 나온 영상 위에 음악만 덧입힌다($0.08). 얹는 방식은 조립(assemble)과 똑같다 —
 * 전체에 한 번, 말할 때 비키게(sidechaincompress), 끝은 페이드아웃.
 *
 *   npx tsx engine/tools/rookery_env.mts engine/tools/add_music.mts <영상.mp4> "<음악 주문 영어>" [나갈파일]
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { makeMusic } from "../../src/lib/providers/lyria";

const src = process.argv[2];
const prompt = process.argv[3];
const out = process.argv[4] ?? src.replace(/\.mp4$/i, "-음악.mp4");
if (!src || !prompt) throw new Error('사용: add_music.mts <영상.mp4> "<음악 주문>" [나갈파일]');

const FF = path.resolve("node_modules/ffmpeg-static/ffmpeg.exe");
const FP = path.resolve("node_modules/ffprobe-static/bin/win32/x64/ffprobe.exe");
const dur = Number(execFileSync(FP, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", src], { encoding: "utf8" }).trim());
console.log(`영상 ${dur.toFixed(2)}초`);

const m = await makeMusic({ prompt });
const mus = path.join(path.dirname(out), "_music_tmp.mp3");
fs.writeFileSync(mus, m.mp3);
console.log(`음악 ${(m.mp3.length / 1024 / 1024).toFixed(2)}MB · $${m.usd} · 구조 ${m.structure ?? "없음"}`);

const fadeAt = Math.max(0, dur - 1.6).toFixed(2);
execFileSync(FF, [
  "-y", "-i", src, "-stream_loop", "-1", "-i", mus,
  "-filter_complex",
  `[1:a]volume=0.32,afade=t=in:st=0:d=1.2,afade=t=out:st=${fadeAt}:d=1.6[m];` +
  `[0:a]asplit=2[v1][v2];` +
  `[m][v2]sidechaincompress=threshold=0.03:ratio=12:attack=15:release=400[mc];` +
  `[v1][mc]amix=inputs=2:duration=first:normalize=0[a]`,
  "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k",
  "-t", dur.toFixed(2), "-movflags", "+faststart", out,
], { stdio: ["ignore", "ignore", "pipe"] });
fs.unlinkSync(mus);
console.log(`나왔다: ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
