/**
 * **주문 길이에 맞추기가 쉼만 줄이는가** (158회차 09-16). 돈 0, 모델 0.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/fit_probe.mts
 *
 * 계획 ③의 기계 절반. 회사가 30일 한도($50)에 걸려 진짜 판을 못 돌리는 동안, 조립의 맞추기만 무음으로 잰다:
 *   A 주문 길이 없음 → 쉼 그대로 · B 여유 있음 → 쉼을 딱 그만큼 줄임 · C 여유 없음 → 0.15초 난간에서 멈추고 목소리는 안 자름 · D 넉넉함 → 쉼을 늘리진 않음
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
const near = (a: number, b: number, tol = 0.2) => Math.abs(a - b) <= tol;
const dir = await mkdtemp(path.join(tmpdir(), "fit-"));
const FF = (await bins()).ffmpeg;
const sil = path.join(dir, "sil.mp3");
await run(FF, ["-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", "1.8", sil]);
const audio = await readFile(sil);
const scenes = [1, 2].map((i) => ({ title: `장면 ${i}`, lines: ["한 줄"], caption: "", audio }));
const look = safeLook({ pad: 1.2, motion: "none", transition: "cut" });
const A = await assemble(scenes, { look });
check("A 주문 길이 없음 → 쉼 그대로 1.20", near(A.padUsed, 1.2, 0.01), A.padUsed);
check("   총길이 ≈ 3.6 + 2×1.2 = 6.0", near(A.total, 6.0), A.total);
// 무음 mp3 는 1.8초를 시켜도 1.83초로 잡힌다(프레임 여백). 기대값은 상수가 아니라 **잰 목소리 길이**에서 낸다 — 첫 판에 상수 0.45 를 박아 헛실패.
const voice = A.audioSec.reduce((x, y) => x + y, 0);
const B = await assemble(scenes, { look, fitSec: 4.5 });
check(`B 주문 4.5초 → 쉼을 (4.5−${voice.toFixed(2)})/2 = ${((4.5 - voice) / 2).toFixed(2)} 로`, near(B.padUsed, (4.5 - voice) / 2, 0.02), B.padUsed);
check("   총길이 ≈ 4.5", near(B.total, 4.5), B.total);
const C = await assemble(scenes, { look, fitSec: 3.7 });
check("C 주문 3.7초(여유 0.1) → 난간 0.15 에서 멈춤", near(C.padUsed, 0.15, 0.01), C.padUsed);
check("   목소리는 안 잘랐다(총길이 ≈ 3.6+0.3 = 3.9 > 3.7)", near(C.total, 3.9) && C.total > 3.7, C.total);
const D = await assemble(scenes, { look, fitSec: 10 });
check("D 주문 10초(넉넉) → 쉼을 늘리진 않는다(1.20 그대로)", near(D.padUsed, 1.2, 0.01), D.padUsed);
console.log(bad ? `\n${bad}건 실패` : "\n전부 통과");
process.exit(bad ? 1 : 0);
