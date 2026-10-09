/**
 * **몬스터를 지피티로 뽑는다** (10-10 사장님 승인). 모델 0 · 값: 그림 토큰만.
 *   npx tsx engine/tools/rookery_env.mts engine/tools/ash_몹그림.mts [이름…] [--진짜] [--장수=2]
 *
 * 제미나이 크레딧이 떨어져 `dot_캐릭터.mts` 를 못 쓴다. 탑 그림(`ash_탑그림.mts`)처럼
 * OpenAI `gpt-image-2` 로 뽑는다. 이 모델은 **투명 배경을 안 준다**(10-10 확인) —
 * 그래서 **선명한 마젠타 한 색**으로 뽑고 기계가 지운다. 지워진 정도는 숫자로 재서 같이 찍는다
 * (10-09 교훈: 배경 자가 없어서 안 지워진 판에 1등을 줬다).
 *
 * 결은 **10-07 사장님 기준**을 그대로 따른다 — 안 화려하게, 철 갑옷, 바랜 색,
 * 얼굴을 다 그리면 어색하니 가리거나 어둠에 둔다, 귀여움은 접는다.
 * 크기 지시는 모델이 두 번 다 안 지켰으므로(10-09) **기계가 줄인다** — ash_적넣기.mts 의 목표몸.
 */
import sharp from "sharp";
import { writeFileSync, mkdirSync } from "node:fs";

const 뿌리 = "C:/Users/az518/Desktop/로키-도트/캐릭터";
const 진짜 = process.argv.includes("--진짜");
const 장수 = Number(process.argv.find((a) => a.startsWith("--장수="))?.split("=")[1] ?? 2);

/** 10~19층 [버려진 광산] — 사장님 10-10 명세. 결은 기사(10-07)에 맞춘다. */
const 몹 = {
  "코볼트 주술사": [
    "A kobold shaman monster: a small hunched lizard-dog creature with dull grey-green scaly skin,",
    "wearing a ragged brown hide cloak and a crude bone necklace, one ear torn.",
    "It grips a short gnarled wooden staff topped with a dim dull-amber stone. Small pale eyes, no visible teeth bared.",
    "A small monster: about 60% of a human's height.",
  ].join(" "),
  "광산 해골 인부": [
    "A skeleton miner monster: a bare yellowed-bone skeleton still wearing a torn leather work apron and a dented iron miner's helmet,",
    "a snapped lantern hook at its belt. It holds a worn iron pickaxe with a chipped head.",
    "Empty eye sockets with a faint dim glow. Coal dust and grime on the bones.",
    "About 95% of a human's height, thin and stooped.",
  ].join(" "),
  "동굴 암살자": [
    "A cave assassin monster: a lean human-shaped figure wrapped head to toe in dark grey-brown rags and worn leather straps,",
    "the face completely hidden by a wound cloth with only a thin dark slit. Dull iron dagger in a reverse grip.",
    "Everything is desaturated and dusty — no bright colors, no exposed skin.",
    "About 90% of a human's height, crouched low and quick.",
  ].join(" "),
};

const 결 = [
  "Style: 16-bit SNES JRPG pixel art sprite, thick dark outlines, flat shading, limited desaturated palette.",
  "Every pixel a clear square block. Grim, worn, dusty — faded colors, dirty textures, nothing shiny or cute.",
  "A single character, full body, standing, facing right, centered.",
  "The background is a FLAT SOLID pure magenta (#FF00FF) field, edge to edge, with absolutely nothing else on it: no ground, no shadow, no scenery, no gradient, no texture, no text, no UI, no frame, no border.",
  "The character itself must contain NO magenta or pink at all.",
  "Nothing glows green, no neon, no modern objects.",
].join(" ");

const 고를 = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const 할것 = 고를.length ? 고를 : Object.keys(몹);
for (const n of 할것) if (!(n in 몹)) { console.error(`모르는 몹: ${n} (있는 것: ${Object.keys(몹).join(" · ")})`); process.exit(1); }

console.log(`몹 ${할것.length}종 × ${장수}장 — gpt-image-2 · 1024×1024 · 투명`);
if (!진짜) { console.log("--진짜 를 붙이면 뽑는다"); process.exit(0); }

const OpenAI = (await import("openai")).default;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY!, maxRetries: 2 });

for (const 이름 of 할것) {
  const 칸 = `${뿌리}/${이름}`;
  mkdirSync(칸, { recursive: true });
  console.log(`\n${이름}…`);
  for (let i = 1; i <= 장수; i++) {
    const r = await openai.images.generate({
      model: "gpt-image-2", prompt: `${몹[이름 as keyof typeof 몹]} ${결}`,
      n: 1, size: "1024x1024", quality: "low",
    });
    const b64 = (r as any).data?.[0]?.b64_json;
    if (!b64) { console.error(`  ${i}장째가 안 왔다`); continue; }
    const 원본 = `${칸}/_원본-${i}.png`;
    writeFileSync(원본, Buffer.from(b64, "base64"));
    // 캐릭터와 같은 비율로 줄인다 — 도트 한 칸 크기가 같아야 한 그림으로 보인다
    const 작게 = await sharp(원본).resize(256, 256, { kernel: "nearest", fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { data, info } = 작게;
    let 지움 = 0;
    for (let k = 0; k < data.length; k += info.channels) {
      const [r2, g2, b2] = [data[k], data[k + 1], data[k + 2]];
      // 마젠타 = 빨강·파랑이 높고 초록이 낮다. 가장자리의 섞인 색까지 넉넉히 집는다.
      if (r2 > 90 && b2 > 90 && g2 < Math.min(r2, b2) * 0.8) { data[k + 3] = 0; 지움++; }
    }
    const 칸수 = data.length / info.channels;
    await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
      .png().toFile(`${칸}/후보-${i}.png`);
    console.log(`  후보-${i}.png · 배경 지움 ${(지움 / 칸수 * 100).toFixed(0)}%`);
  }
}
console.log(`\n끝. ${뿌리}/<이름>/후보-*.png — 사장님이 고른 뒤 ash_적넣기.mts 로 넣는다.`);
