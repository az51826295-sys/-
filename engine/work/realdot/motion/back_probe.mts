/**
 * "뒤 그림이 정면을 또 그린 것" 을 잡는 자 후보 — 돈 0(기계) + 판단자 한 칸 질문(약 1원씩).
 * 기계: 정면(1번)과 뒤(3번)의 같은 자리 칸 색 일치율. 진짜 뒤면 얼굴·배 무늬가 없어 일치율이 낮다.
 * 대조: 용(뒤 멀쩡) · 고양이 · 슬라임 vs 마법사(뒤에 수염 — 사람 눈으로 확인된 고장) · 기사(애매).
 *   npx tsx engine/work/realdot/motion/back_probe.mts [--judge]
 */
import { readFileSync } from "node:fs";
import sharp from "sharp";
for (const l of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ||= l.slice(i + 1).trim();
}
const R = "C:/Users/az518/Desktop/두근도트-스레드/realdot";
const CASES: [string, string][] = [
  ["용(멀쩡)", `${R}/first-create/turn3b-sheet-1x.png`],
  ["용a", `${R}/first-create/turn3a-sheet-1x.png`],
  ["용c", `${R}/first-create/turn3c-sheet-1x.png`],
  ["고양이", `${R}/compare4/cat/ours-turn-1x.png`],
  ["슬라임", `${R}/compare4/slime/ours-turn-1x.png`],
  ["기사(애매)", `${R}/compare4/knight/ours-turn-1x.png`],
  ["마법사(고장)", `${R}/compare4/wizard/ours-turn-1x.png`],
];
const JUDGE = process.argv.includes("--judge");
async function frame(p: string, i: number) {
  const s = readFileSync(p); const m = await sharp(s).metadata(); const cw = Math.floor(m.width! / 4);
  return sharp(s).extract({ left: i * cw, top: 0, width: cw, height: m.height! }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}
const lum = (d: Buffer, i: number) => 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
for (const [name, p] of CASES) {
  const f = await frame(p, 0), b = await frame(p, 2);
  // 같은 자리 칸: 둘 다 칠해진 칸 중 색이 거의 같은(거리<40) 비율 + 밝기 구조(이웃과의 밝기 차 부호) 일치율
  let both = 0, same = 0, edgeSame = 0, edgeN = 0;
  const W = f.info.width, Hh = f.info.height;
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    if (!f.data[i + 3] || !b.data[i + 3]) continue;
    both++;
    if (Math.abs(f.data[i] - b.data[i]) + Math.abs(f.data[i + 1] - b.data[i + 1]) + Math.abs(f.data[i + 2] - b.data[i + 2]) < 40) same++;
    if (x + 1 < W && f.data[i + 7] && b.data[i + 7]) { edgeN++; if (Math.sign(Math.round((lum(f.data, i) - lum(f.data, i + 4)) / 20)) === Math.sign(Math.round((lum(b.data, i) - lum(b.data, i + 4)) / 20))) edgeSame++; }
  }
  let judge = "";
  if (JUDGE) {
    const { createOpenAIProvider } = await import("../../../../src/lib/providers/openai");
    const { z } = await import("zod");
    const ai = createOpenAIProvider({ judgmentModel: "gpt-5.6-luna" });
    const big = async (x: typeof b) => (await sharp(x.data, { raw: { width: W, height: Hh, channels: 4 } }).flatten({ background: "#ffffff" }).resize({ height: 384, kernel: "nearest" }).png().toBuffer()).toString("base64");
    const r = await ai.generateStructuredOutput({
      systemInstructions: "Image 1 is a pixel-art character seen from the FRONT. Image 2 is supposed to be the SAME character seen from BEHIND. " +
        "Compare them. If image 2 still shows the face (eyes, mouth, beard, nose) or the front of the body (belly pattern, chest emblem, buttons) like image 1, it is NOT a back view. " +
        "If the face is hidden and we see the back of the head/hat/body, it IS a back view. Answer facesAway.",
      input: "Is image 2 a real back view?", images: [await big(f), await big(b)],
      schema: z.object({ facesAway: z.boolean(), seen: z.string() }), schemaName: "back_view", maxTokens: 16000, tier: "judgment",
    });
    judge = ` · 판단자: 뒤=${r.output.facesAway} (${r.output.seen.slice(0, 80)})`;
  }
  console.log(`${name}: 같은 자리 같은 색 ${((100 * same) / both).toFixed(0)}% · 밝기 구조 일치 ${((100 * edgeSame) / Math.max(1, edgeN)).toFixed(0)}%${judge}`);
}
