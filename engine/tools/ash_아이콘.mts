/**
 * **도트 아이콘을 격자로 뽑아 한 칸씩 자른다** (10-10 사장님 시안).
 *   npx tsx engine/tools/rookery_env.mts engine/tools/ash_아이콘.mts [묶음…] [--진짜]
 *
 * 아이콘을 한 장씩 뽑으면 스무 장이 넘는다. 그래서 **4×4 격자 한 장**으로 뽑고
 * 격자 칸을 그대로 잘라 낸다 — 사람 모양을 자르는 것과 달리 **칸 위치가 정해져 있어서**
 * 자르기가 어긋나지 않는다(10-07 "넌 자르기를 못해" 는 시트에서 사람을 자를 때였다).
 *
 * 배경은 마젠타로 받아 기계가 지운다(gpt-image-2 는 투명 배경을 안 준다).
 * 자른 뒤 **빈 칸(거의 다 투명한 칸)을 세서** 몇 개가 제대로 나왔는지 찍는다.
 */
import sharp from "sharp";
import { writeFileSync, mkdirSync } from "node:fs";

const 진짜 = process.argv.includes("--진짜");
const 칸뿌리 = "C:/Users/az518/Desktop/로키-도트/아이콘";
mkdirSync(칸뿌리, { recursive: true });

/** 한 묶음 = 격자 한 장. 왼쪽 위부터 오른쪽으로 읽는다. */
const 묶음들: Record<string, { 열: number; 줄: number; 칸: string[]; 말: string }> = {
  탭: { 열: 4, 줄: 2, 말: "game UI tab icons",
    칸: ["a round wooden shield with iron rim", "a hooded person's head and shoulders, front view",
         "two crossed swords", "a blacksmith hammer and anvil",
         "a wooden market cart with a cloth awning", "an open leather backpack",
         "a stone tower", "a burning torch"] },
  서브: { 열: 4, 줄: 1, 말: "game UI small tab icons",
    칸: ["a sword crossed with a shield", "a small flame", "a four-pointed star sparkle", "a coiled scroll"] },
  재료: { 열: 4, 줄: 2, 말: "RPG crafting material icons",
    칸: ["a jagged glowing blue-violet crystal shard", "a pale wisp of beast spirit in a small glass orb",
         "a round iron core with a carved rune", "a folded piece of thick brown hide",
         "a bent scrap of grey steel plate", "a curved yellowed fang",
         "a huge cracked bone fragment", "a small pile of silver star dust"] },
  물건: { 열: 4, 줄: 2, 말: "RPG item icons",
    칸: ["a plain iron shortsword, blade up", "a heavy two-handed greatsword, blade up",
         "a long knight's sword with a fanged crossguard, blade up", "a wooden staff with a dull stone on top",
         "a studded leather chest armor", "a grey steel plate chest armor",
         "a brown fur-lined chest armor", "a glass vial of pale blue liquid with a cork"] },
  /* ── 10-11 "그림 넣어 모든거" — 4~8구간이 생기며 재료 10·장비 14·영혼석 6 이 그림 없이 돌고 있었다.
     결은 앞의 것들과 같게: 바랜 색, 두꺼운 외곽선, 반짝이지 않게. ── */
  재료2: { 열: 4, 줄: 3, 말: "RPG crafting material icons",
    칸: ["a chipped grey carved temple stone fragment with a worn engraving",
         "a single tarnished brass scale pan weight on a short chain",
         "a small corked flask of thick murky green swamp liquid",
         "a leathery venom sac with two short fangs attached",
         "a rough chunk of black basalt with dull orange cracks",
         "a cracked round stone core with a dim orange glow inside",
         "a pale blue-white shard of frozen crystal, frosted",
         "a single frozen teardrop gem on a thin silver chain",
         "a small dark orb of swirling black mist in a bone ring",
         "a large lidless dark eye, dried and bound with dark thread",
         "a plain cloth pouch tied with cord", "a cracked empty clay bowl"] },
  물건2: { 열: 4, 줄: 4, 말: "RPG weapon and armor icons",
    칸: ["a massive greatsword carved from pale bone, blade up",
         "a heavy plate chest armor made of lashed bone plates",
         "a long ceremonial sword with a small scale pan on the crossguard, blade up",
         "a grey stone slab chest armor with worn carvings",
         "a curved serrated sword dripping dull green venom, blade up",
         "a chest armor of overlapping dark green swamp scales",
         "a thick black basalt sword with dull orange cracks, blade up",
         "a bulky chest armor of fitted black basalt blocks",
         "a broad sword with a cracked glowing stone core set in the hilt, blade up",
         "a very heavy iron chest armor with a round stone core on the breast",
         "a slender pale sword rimed with frost, blade up",
         "a chest armor of pale frosted plates with icicle fringes",
         "a dark jagged sword that seems to swallow light, blade up",
         "a chest armor of polished black obsidian shards",
         "a plain wooden training sword, blade up", "a plain cloth tunic"] },
  영혼석: { 열: 3, 줄: 2, 말: "RPG soul stone gem icons, each a polished round stone with a symbol cut into it",
    칸: ["a round grey stone with a swirling wind spiral cut into it",
         "a round dark red stone with a single droplet shape cut into it",
         "a round violet stone with an upside-down triangle cut into it",
         "a round pale gold stone with a rising sun arc cut into it",
         "a round silver stone with a four-pointed star cut into it",
         "a round pale blue stone with a feathered wing cut into it"] },
  /* 10-10 사장님 시안 2차: 대장간·시장이 **큰 카드 두 갈래**로 갈린다 */
  갈래: { 열: 2, 줄: 2, 말: "large RPG menu card illustrations",
    칸: ["a cheerful middle-aged merchant, warm smile, brown vest over a cream shirt, seen from the waist up, holding a handful of bright gold coins in one palm and a bulging coin pouch in the other hand",
         "an open wooden treasure chest overflowing with swords, colorful potion bottles and a helmet, a small paper price tag tied to the lid",
         "a shining blacksmith hammer crossed in front of a polished steel chest armor, bright sparkles around them",
         "a stone forge with a bright roaring fire inside and an iron anvil in front of it, tongs leaning against the side"] },
};

const 결 = [
  "Style: 16-bit SNES JRPG pixel art icon, thick dark outline, flat shading, limited desaturated palette.",
  "Every pixel a clear square block. Worn, grim, medieval — no shine, no gloss, no modern objects, no text.",
].join(" ");

const 고를 = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const 할것 = 고를.length ? 고를 : Object.keys(묶음들);
for (const n of 할것) if (!(n in 묶음들)) { console.error(`모르는 묶음: ${n}`); process.exit(1); }

console.log(`아이콘 묶음 ${할것.length}개 — gpt-image-2 · 1024×1024`);
if (!진짜) { console.log("--진짜 를 붙이면 뽑는다"); process.exit(0); }

const OpenAI = (await import("openai")).default;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY!, maxRetries: 2 });
const 묶 = (n: number) => Math.max(0, Math.min(255, Math.round(n)));

for (const 이름 of 할것) {
  const m = 묶음들[이름];
  const 칸수 = m.열 * m.줄;
  const 밝게 = 이름 === "갈래"
    ? " These are menu card illustrations: a little brighter and more inviting than the rest, with clear warm highlights, but still the same pixel art style."
    : "";
  const 주문 = [
    `A single image containing exactly ${칸수} separate ${m.말}, laid out in a strict ${m.열}x${m.줄} grid.`,
    `Each cell holds ONE icon, centered, the same size, with clear empty space between cells — the icons must NOT touch or overlap.`,
    `Reading left to right, top to bottom, the icons are: ${m.칸.map((c, i) => `(${i + 1}) ${c}`).join(", ")}.`,
    "The background everywhere, including between the icons, is FLAT SOLID pure magenta (#FF00FF) — no grid lines, no frames, no borders, no shadows, no labels.",
    "The icons themselves must contain no magenta or pink.",
    결 + 밝게,
  ].join(" ");

  console.log(`\n${이름} (${m.열}×${m.줄} = ${칸수}칸)…`);
  const r = await openai.images.generate({ model: "gpt-image-2", prompt: 주문, n: 1, size: "1024x1024", quality: "low" });
  const b64 = (r as any).data?.[0]?.b64_json;
  if (!b64) { console.error("  안 왔다"); continue; }
  const 큰 = `${칸뿌리}/_원본-${이름}.png`;
  writeFileSync(큰, Buffer.from(b64, "base64"));

  // 배경 지우고 색 보정 — 몹 그림과 같은 기준
  const { data, info } = await sharp(큰).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let k = 0; k < data.length; k += info.channels) {
    const [r2, g2, b2] = [data[k], data[k + 1], data[k + 2]];
    if (r2 > 90 && b2 > 90 && g2 < Math.min(r2, b2) * 0.8) { data[k + 3] = 0; continue; }
    const 과 = (r2 + b2) / 2 - g2;
    if (r2 > g2 && b2 > g2 && 과 > 14) { data[k] = 묶(r2 - 과 * .92); data[k + 2] = 묶(b2 - 과 * .92); }
  }
  const 깨끗 = await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } }).png().toBuffer();

  // 격자 칸마다 잘라 내고, 투명 여백을 떼고 64칸에 맞춘다
  const 폭 = Math.floor(info.width / m.열), 높 = Math.floor(info.height / m.줄);
  let 빈칸 = 0;
  for (let i = 0; i < 칸수; i++) {
    const cx = (i % m.열) * 폭, cy = Math.floor(i / m.열) * 높;
    const 잘 = await sharp(깨끗).extract({ left: cx, top: cy, width: 폭, height: 높 }).png().toBuffer();
    // 다 투명하면 모델이 그 칸을 비운 것이다
    const { data: d2 } = await sharp(잘).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let 보임 = 0; for (let k = 3; k < d2.length; k += 4) if (d2[k] > 32) 보임++;
    if (보임 < 200) { 빈칸++; console.log(`  ${i + 1}번 칸이 비었다`); continue; }
    const 끝변 = 이름 === "갈래" ? 160 : 64;          // 갈래는 카드에 크게 들어간다
    await sharp(잘).trim({ threshold: 1 })
      .resize(끝변 - 8, 끝변 - 8, { fit: "inside", kernel: "nearest" })
      .extend({ top: 4, bottom: 4, left: 4, right: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .resize(끝변, 끝변, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: "nearest" })
      .png().toFile(`${칸뿌리}/${이름}-${i + 1}.png`);
  }
  console.log(`  ${칸수 - 빈칸}/${칸수} 칸 나옴 → ${칸뿌리}/${이름}-*.png`);
}
console.log("\n끝. 사장님이 보고 고른 뒤 public/ash/art/icon/ 으로 옮긴다.");
