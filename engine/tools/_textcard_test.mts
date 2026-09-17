import fs from "node:fs";
import path from "node:path";
const { assemble } = await import("@/lib/video/assemble");
import sharp from "sharp";
const bg = await sharp({ create: { width: 1280, height: 720, channels: 3, background: { r: 16, g: 20, b: 28 } } }).png().toBuffer();
// 무음 0.1초짜리 mp3 대신, 짧은 wav 를 만들어 오디오로 쓴다(배관만 시험).
const { execFile } = await import("node:child_process");
const { promisify } = await import("node:util");
const run = promisify(execFile);
const ff = (await import("ffmpeg-static")).default as unknown as string;
const tmp = fs.mkdtempSync(path.join(process.env.TEMP || "/tmp", "cardtest-"));
const aud = path.join(tmp, "a.mp3");
await run(ff, ["-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", "3", "-q:a", "9", aud]);
const audio = fs.readFileSync(aud);
const out = await assemble([
  { image: bg, audio, caption: "테스트", title: "A01  Broken Access Control", lines: ["2017년 5위 → 2021년 1위", "권한 경계와 워크플로를 점검하세요"], cite: "OWASP Top 10:2021, p.10" },
], {});
fs.writeFileSync(path.join(tmp, "out.mp4"), out.mp4);
fs.writeFileSync(path.join(tmp, "frame.png"), out.mid);
console.log("OK", tmp, "총", out.total.toFixed(1), "초");
