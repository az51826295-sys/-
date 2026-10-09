/**
 * **탑 맵 그림을 지피티로 뽑는다** (10-09 사장님 "지피티에서 이미지 뽑아").
 *   npx tsx engine/tools/rookery_env.mts engine/tools/ash_탑그림.mts [--진짜]
 *
 * 제미나이 크레딧이 떨어져서(`prepayment credits are depleted`) 탑 기둥·꼭대기를 못 뽑았다.
 * 같은 주문을 OpenAI `gpt-image-2` 로 돌린다. 세로로 긴 틀(1024×1536)을 쓴다 — 탑은 세로다.
 *
 * 뽑은 뒤 **캐릭터와 같은 비율(약 1/4)로 줄여** 도트 한 칸 크기를 맞춘다.
 * 배경만 고운 그림이면 캐릭터가 붙여 넣은 스티커로 보인다(dot_배경 과 같은 규칙).
 * 쓴 돈은 engine/data/openai_image_ledger.jsonl 에 남긴다 — 안 적으면 어디로 샜는지 모른다.
 */
import sharp from "sharp";
import { appendFileSync, writeFileSync, mkdirSync } from "node:fs";

const 진짜 = process.argv.includes("--진짜");
const 칸 = "C:/Users/az518/Desktop/로키-도트/배경";
const 게임 = "public/ash/art";
mkdirSync(칸, { recursive: true });

const 그림체 = "Style: 16-bit SNES JRPG pixel art, thick dark outlines, flat shading, limited palette. Every pixel a clear square block.";
const 장면 = {
  "tower-shaft": {
    이름: "탑 기둥(이어붙임)",
    주문: [
      "A single vertical pixel art image: one section of the OUTSIDE of a huge stone tower, seen straight on from a distance.",
      "The tower shaft fills the middle of the image from the very top edge to the very bottom edge: rough dark grey stone blocks,",
      "narrow arched windows with faint warm light, iron braziers on brackets, a few tattered banners, cracks with creeping ivy.",
      "Night sky with drifting mist on both sides of the tower.",
      "SEAMLESS TILE: the top edge and the bottom edge must match exactly so copies can be stacked vertically with no visible seam.",
      "The tower must be the same width and centered at both the top edge and the bottom edge. No roof, no base, no ground, no horizon.",
      "Subtle hint only, easy to miss: one window frame is smooth grey concrete instead of stone.",
      "Nothing glows green, no pipes, no hazard stripes, no electric lights, no text, no UI, no characters.",
      그림체 + " Dark, cold, towering.",
    ].join(" "),
  },
  "tower-top": {
    이름: "탑 꼭대기",
    주문: [
      "A single vertical pixel art image: the TOP of a huge stone tower against a night sky, seen straight on from a distance.",
      "The tower shaft rises from the bottom edge and ends in a battlemented summit with a broken spire, a large iron beacon with a weak flame, and torn banners.",
      "Rough dark grey stone, narrow arched windows with faint warm light, drifting mist, a cold moon and stars behind it.",
      "At the BOTTOM edge the tower shaft must be centered and the same width as the rest of the tower, with no ground.",
      "Nothing glows green, no pipes, no hazard stripes, no electric lights, no text, no UI, no characters.",
      그림체 + " Dark, cold, the end of a long climb.",
    ].join(" "),
  },
};

console.log(`탑 그림 ${Object.keys(장면).length}장 — gpt-image-2 · 1024×1536`);
if (!진짜) { console.log("--진짜 를 붙이면 뽑는다"); process.exit(0); }

const OpenAI = (await import("openai")).default;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY!, maxRetries: 2 });

for (const [키, 장] of Object.entries(장면)) {
  console.log(`\n${장.이름}…`);
  const r = await openai.images.generate({
    model: "gpt-image-2", prompt: 장.주문, n: 1, size: "1024x1536", quality: "low",
  });
  appendFileSync("engine/data/openai_image_ledger.jsonl",
    JSON.stringify({ what: `images.generate ash_${키}`, model: "gpt-image-2", n: 1, quality: "low", size: "1024x1536", usage: r.usage }) + "\n");
  const b64 = r.data?.[0]?.b64_json;
  if (!b64) { console.error("  그림이 안 왔다"); continue; }
  const 원본 = `${칸}/_원본-${키}.png`;
  writeFileSync(원본, Buffer.from(b64, "base64"));
  const m = await sharp(원본).metadata();
  // 캐릭터와 같은 비율로 줄인다 — 도트 한 칸 크기가 같아야 한 그림으로 보인다
  const w = Math.round((m.width ?? 1024) / 4), h = Math.round((m.height ?? 1536) / 4);
  await sharp(원본).resize(w, h, { kernel: "nearest" }).png().toFile(`${게임}/${키}.png`);
  console.log(`  ${m.width}×${m.height} → ${게임}/${키}.png ${w}×${h}`);
}
console.log("\n끝. manifest 에 넣는 것은 ash_적넣기 처럼 따로 — 맵은 art/ 경로를 바로 읽는다.");
