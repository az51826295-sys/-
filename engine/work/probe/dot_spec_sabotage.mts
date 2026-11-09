/**
 * 기준 검사의 **심은 고장** — 린을 한 칸 띄워 놓고 `--check` 가 잡는지 본다.
 * 끝나면 되돌린다(git 이 아니라 **내가 받아 둔 원본**으로 — 검사 중에 git 을 건드리지 않는다).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const sharp = (await import("sharp")).default;

const 길 = "public/dot-sprites/rin/neutral.png";
const 원본 = readFileSync(길);
const m = await sharp(원본).metadata();
const W = m.width ?? 512, H = m.height ?? 512;

/**
 * 한 칸(8화소) 위로 올려 붙인다 → 아래 여백이 8 이 된다.
 *
 * **두 번에 나눠 한다.** sharp 는 한 파이프라인에서 `extract` 를 `composite` 보다 **먼저** 돌린다 —
 * 한 번에 이으면 심은 것이 안 심기고, 그러면 "자가 못 잡는다" 가 아니라 **심은 게 없는 것**이다
 * ([[planted-fault-must-be-well-formed]]).
 */
const 잘림 = await sharp(원본).extract({ left: 0, top: 8, width: W, height: H - 8 }).png().toBuffer();
const 띄운것 = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: 잘림, top: 0, left: 0 }]).png().toBuffer();
writeFileSync(길, 띄운것);
console.log(`심었다 — 린 발밑을 8화소 띄웠다`);

let 잡았나 = false;
try {
  execFileSync("npx", ["tsx", "engine/tools/dot_character_spec.mts", "--check"], { encoding: "utf8", shell: true });
} catch (e: any) {
  잡았나 = true;
  const 글 = String(e.stdout ?? "");
  console.log(글.split(String.fromCharCode(10)).filter((l) => l.includes("rin") && l.includes("❌")).join(String.fromCharCode(10)) || 글.slice(-200));
}
writeFileSync(길, 원본);
console.log(`되돌렸다 · ${잡았나 ? "✅ 검사가 잡는다" : "❌ 검사가 못 잡는다 — 이 문은 못 쓴다"}`);
process.exit(잡았나 ? 0 : 1);
