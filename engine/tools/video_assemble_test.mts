/**
 * 영상 조립 배관을 모델 없이 시험한다: 색 카드 3장 + 삐 소리 3토막 → mp4 + srt + 사진 둘.
 *   npx tsx engine/tools/video_assemble_test.mts <출력 폴더>
 */
import ffmpegPath from "ffmpeg-static";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { assemble } from "../../src/lib/video/assemble";

const run = promisify(execFile);
const FF = ffmpegPath as unknown as string;
const outDir = process.argv[2] ?? ".";
await mkdir(outDir, { recursive: true });
const dir = await mkdtemp(path.join(tmpdir(), "rk-vat-"));
const scenes = [];
for (const [i, c] of ["navy", "darkgreen", "maroon"].entries()) {
  const img = path.join(dir, `c${i}.png`), aud = path.join(dir, `t${i}.mp3`);
  await run(FF, ["-y", "-f", "lavfi", "-i", `color=c=${c}:s=1536x1024:d=1`, "-frames:v", "1", img]);
  await run(FF, ["-y", "-f", "lavfi", "-i", `sine=frequency=${440 + i * 110}:duration=${1.2 + i * 0.6}`, "-c:a", "libmp3lame", "-q:a", "4", aud]);
  scenes.push({ image: await readFile(img), audio: await readFile(aud), caption: `장면 ${i + 1}: ${c}` });
}
const t0 = Date.now();
const a = await assemble(scenes);
console.log(`조립 ${((Date.now() - t0) / 1000).toFixed(1)}초 · 길이 ${a.total.toFixed(2)}s · 장면 ${a.durations.map((d) => d.toFixed(2)).join("/")} · 소리 ${a.hasAudio} · mp4 ${(a.mp4.length / 1024).toFixed(0)} KB`);
await writeFile(path.join(outDir, "test.mp4"), a.mp4);
await writeFile(path.join(outDir, "test.srt"), a.srt);
await writeFile(path.join(outDir, "test_first5s.png"), a.first5s);
await writeFile(path.join(outDir, "test_mid.png"), a.mid);
console.log(a.srt.split("\n").slice(0, 4).join(" | "));
