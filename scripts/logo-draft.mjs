// 로키 마크 시안을 그린다 — 까마귀 머리 옆모습, 픽셀.
//
// 2026-09-03 사장님 사양: **픽셀 도트 · 머리 옆모습 · 심볼만.**
// 손으로 찍은 것이 퀄리티가 안 나와서 생성기로 돌린다.
//
//   node scripts/logo-draft.mjs
//
// 값이 든다(gpt-image-2). 시안 수는 아래 `DRAFTS` 개수만큼이다.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import OpenAI from "openai";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const BASE =
  "Pixel art logo mark of a crow's head in side profile, facing left. " +
  "Chunky visible square pixels, hard edges, no anti-aliasing, no blur. " +
  "Pure white on a transparent background, one flat colour only. " +
  "Heavy straight beak, flat crown, small negative-space eye. " +
  "Bold and simple so it still reads at 16 pixels. " +
  "Centred, no text, no letters, no border, no frame, no gradient, no shading.";

// 같은 사양 안에서 결만 달리한다. 사장님이 고르실 것이 있어야 한다 —
// 하나만 내면 그건 고른 것이 아니라 받은 것이다.
const DRAFTS = [
  ["a-silhouette", "A clean solid silhouette, chunky 32x32 grid."],
  ["b-angular", "Angular and geometric, sharp facets, slightly aggressive."],
  ["c-hackles", "Shaggy throat feathers suggested with a few jagged pixel steps."],
  ["d-compact", "Very compact and heavy, thick beak, minimal detail, 24x24 grid."],
];

const client = new OpenAI({ apiKey: env.OPENAI_API_KEY, maxRetries: 3 });
mkdirSync("public/logo/drafts", { recursive: true });

for (const [name, extra] of DRAFTS) {
  process.stdout.write(`${name} … `);
  try {
    const res = await client.images.generate({
      model: "gpt-image-2",
      prompt: `${BASE} ${extra}`,
      n: 1,
      size: "1024x1024",
      quality: "medium",
      background: "transparent",
      output_format: "png",
    });
    const b64 = res.data?.[0]?.b64_json;
    if (!b64) throw new Error("빈 그림");
    writeFileSync(`public/logo/drafts/${name}.png`, Buffer.from(b64, "base64"));
    console.log("됨");
  } catch (e) {
    // 하나가 안 나와도 나머지는 계속 뽑는다. 값은 이미 나간 것만 나간다.
    console.log("안 됨:", e?.message ?? e);
  }
}
console.log("\npublic/logo/drafts/ 에 있습니다.");
