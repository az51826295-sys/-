/**
 * **정말 움직이는가** (153회차 09-16). 돈 0, 모델 0.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/motion_probe.mts
 *
 * 사장님 "? 연출은?" — 149회차의 '연출' 은 글자 크기·색이었고 화면은 정지 그림 하드컷이었다.
 * 말로 "움직인다" 고 쓰지 않고 **프레임을 떠서 다른지 센다**: 같은 장면의 0.1초와 1.2초 프레임이
 * 다르면 움직인 것이고, 같으면 정지 그림이다. 굵기도 같이 잰다(147회차에 '고쳤다' 고 하고 안 고쳐져 있었다).
 */
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const run = promisify(execFile);
const { assemble, bins } = await import("../../src/lib/video/assemble");
const { safeLook } = await import("../../src/lib/video/look");

let bad = 0;
const check = (n: string, ok: boolean, got?: unknown) => { if (!ok) bad++; console.log(ok ? "통과" : "실패", n, ok ? "" : JSON.stringify(got)); };
const dir = await mkdtemp(path.join(tmpdir(), "motion-"));

// 목소리 대신 무음 1.8초(연출만 본다).
const FF = (await bins()).ffmpeg;   // 저장소가 들고 다니는 것을 쓴다 — 윈도우엔 시스템 ffmpeg 가 없다
const sil = path.join(dir, "sil.mp3");
await run(FF, ["-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", "1.8", sil]);
const audio = await readFile(sil);
const scene = { title: "카드 없이 바로 써보세요", lines: ["말하면 mp4로 나옵니다", "이상하면 그 부분만 다시"], audio, caption: "" };

async function frames(look: Parameters<typeof safeLook>[0], tag: string) {
  const a = await assemble([{ ...scene }, { ...scene }], { look, padSec: 0.2 });
  const f = path.join(dir, `${tag}.mp4`);
  await writeFile(f, a.mp4);
  const shots: string[] = [];
  for (const t of ["0.10", "0.60", "1.20"]) {
    const png = path.join(dir, `${tag}-${t}.png`);
    await run(FF, ["-y", "-ss", t, "-i", f, "-frames:v", "1", png]);
    shots.push(png);
  }
  return shots;
}
// 첫 판에서 바이트 같음으로 쟀더니 **압축 잡음까지 '움직임' 으로 세어졌다**(같은 그림인데 0.6초와 1.2초가 다름).
// h264 는 같은 화면도 프레임마다 값이 조금씩 다르다. 그래서 **얼마나 다른지**(PSNR)로 잰다 — 높을수록 같은 화면이다.
// 문턱을 하나 박는 대신 **견준다**: 움직이는 판이 안 움직이는 판보다 확실히 더 달라야 한다.
async function psnr(a: string, b: string): Promise<number> {
  const { stderr } = await run(FF, ["-hide_banner", "-i", a, "-i", b, "-lavfi", "psnr", "-f", "null", "-"]).catch((e) => ({ stderr: String(e.stderr ?? "") }));
  const m = /average:([0-9.]+|inf)/.exec(String(stderr));
  return !m ? 0 : m[1] === "inf" ? 999 : Number(m[1]);
}

const still = await frames(safeLook({ motion: "none", reveal: "all", transition: "cut" }), "still");
const rise = await frames(safeLook({ motion: "rise", reveal: "line", transition: "fade" }), "rise");

const rEarly = await psnr(rise[0], rise[1]);      // 올라오는 판: 0.1 → 0.6
const rLate = await psnr(rise[1], rise[2]);       // 올라오는 판: 0.6 → 1.2 (한 줄씩 붙는 중)
const sEarly = await psnr(still[0], still[1]);
const sLate = await psnr(still[1], still[2]);     // 가만히: 다 뜬 뒤
console.log(`
얼마나 같은가(PSNR, 높을수록 같은 화면)`);
console.log(`  올라오며 나타남: 0.1→0.6 ${rEarly.toFixed(1)} · 0.6→1.2 ${rLate.toFixed(1)}`);
console.log(`  가만히        : 0.1→0.6 ${sEarly.toFixed(1)} · 0.6→1.2 ${sLate.toFixed(1)}
`);
check("올라오며 나타나는 판은 실제로 화면이 바뀐다", rEarly < 40, rEarly);
check("   한 줄씩 붙는 동안에도 계속 바뀐다", rLate < 40, rLate);
check("가만히 있는 판은 다 뜬 뒤 멈춘다", sLate > rLate + 5, { sLate, rLate });
check("영상이 실제로 만들어졌다", (await readFile(rise[2])).length > 1000);
console.log(`\n프레임: ${dir}`);
console.log(bad ? `${bad}건 실패` : "전부 통과");
process.exit(bad ? 1 : 0);
