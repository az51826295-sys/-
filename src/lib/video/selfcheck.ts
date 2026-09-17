import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { assemble, bins } from "./assemble";

/**
 * 영상 배관 자가 점검 (112회차 09-15). 모델 없음, 돈 0, 몇 초.
 *
 * 111회차 시험판이 잡은 것: 실서비스 영상이 09-07 이후 일주일 넘게 조용히 죽어 있었다(서버 ffmpeg 에 drawtext 없음). 아무도 몰랐던 이유는
 * 영상 배관을 **모델 없이** 재는 줄이 서버엔 없었기 때문이다(로컬 자 `video_assemble_test.mts` 만 있었다). 이 점검은 워커가 뜰 때와
 * 매일 자가진화 때 돈다 — 삐 소리 2토막 + 글자 카드로 진짜 `assemble()` 을 한 바퀴 돌려 mp4 가 나오는지 본다. 글자 굽기(drawtext)까지 지난다.
 */
const run = promisify(execFile);

export type VideoSelfcheck = { ok: boolean; ffmpeg: string; ms: number; error?: string };

/** `opts.ffmpeg` 는 자(probe)가 고장을 재현할 때만 — 엉뚱한 바이너리를 주고 '고장' 이 제대로 보고되는지 본다. */
export async function videoSelfcheck(opts: { ffmpeg?: string } = {}): Promise<VideoSelfcheck> {
  const t0 = Date.now();
  let ffmpeg = "?";
  const dir = await mkdtemp(path.join(tmpdir(), "rk-vsc-"));
  try {
    ffmpeg = opts.ffmpeg ?? (await bins()).ffmpeg;
    const scenes = [];
    for (const i of [0, 1]) {
      const aud = path.join(dir, `t${i}.mp3`);
      await run(ffmpeg, ["-y", "-f", "lavfi", "-i", `sine=frequency=${440 + i * 220}:duration=0.8`, "-c:a", "libmp3lame", "-q:a", "6", aud]);
      scenes.push({ audio: await readFile(aud), caption: `점검 ${i + 1}`, title: `영상 배관 점검 ${i + 1}`, lines: ["글자가 구워지는가"] });
    }
    const a = await assemble(scenes, { width: 640, height: 360 });
    const ok = a.mp4.length > 1000 && a.total > 1 && a.hasAudio;
    return { ok, ffmpeg, ms: Date.now() - t0, ...(ok ? {} : { error: `mp4 ${a.mp4.length}B · 길이 ${a.total.toFixed(2)}s · 소리 ${a.hasAudio}` }) };
  } catch (e) {
    return { ok: false, ffmpeg, ms: Date.now() - t0, error: (e instanceof Error ? e.message : String(e)).slice(0, 300) };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
