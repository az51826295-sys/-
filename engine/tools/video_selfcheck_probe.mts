/**
 * 영상 배관 자가 점검의 자 (112회차 09-15). 돈 0.
 *   npx tsx engine/tools/video_selfcheck_probe.mts
 * 1) 정상: ok=true, mp4 가 나온다. 2) 고장 재현: 엉뚱한 ffmpeg 경로를 주면 ok=false 에 이유가 있다 — 잡지 못하는 자는 자가 아니다.
 */
const { videoSelfcheck } = await import("../../src/lib/video/selfcheck");
let bad = 0;
const check = (name: string, ok: boolean, got?: unknown) => { if (!ok) bad++; console.log(ok ? "통과" : "실패", name, ok ? "" : JSON.stringify(got)); };

const a = await videoSelfcheck();
check(`정상: ok · ${a.ffmpeg.split(/[\\/]/).slice(-2).join("/")} · ${a.ms}ms`, a.ok && !a.error, a);
const b = await videoSelfcheck({ ffmpeg: "C:/nope/ffmpeg.exe" });
check(`고장 재현: ok=false 에 이유 있음 (${(b.error ?? "").slice(0, 60)})`, !b.ok && !!b.error, b);
console.log(bad ? `실패 ${bad}` : "전부 통과");
process.exitCode = bad ? 1 : 0;
